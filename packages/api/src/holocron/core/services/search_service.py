"""Cross-entity search business logic.

Takes a free-text query and fans out over assets, actors, and rules,
then ranks the materialised :Container / :Field graph in parallel to
surface column-level hits.

Asset / actor / rule matching goes through native Neo4j vector +
fulltext indexes (populated by `EmbeddingService` / BGE-small, 384-dim,
cosine + a Lucene FTS index). The two channels merge via `fold_fts`
so a literal name match always beats pure semantic similarity. See
``search_scoring`` for the constants and fusion functions; see
``search_schema_nodes`` for the schema-graph ranker.
"""

import logging
from typing import Any

from holocron.api.schemas.actors import ActorType
from holocron.api.schemas.assets import AssetType
from holocron.api.schemas.search import (
    ActorHit,
    AssetHit,
    RuleHit,
    SearchHit,
    SearchResponse,
)
from holocron.core.services.actor_service import ActorService
from holocron.core.services.asset_service import AssetService
from holocron.core.services.embedding_service import EmbeddingService
from holocron.core.services.query_parser import HitKind, _ALL_KINDS, parse_query
from holocron.core.services.rule_service import RuleService
from holocron.core.services.search_haystacks import (
    actor_haystack,
    asset_haystack,
    matches,
    passes_filters,
    rule_haystack,
)
from holocron.core.services.search_schema_nodes import rank_schema_nodes
from holocron.core.services.search_scoring import (
    NEUTRAL_SCORE,
    PER_KIND_CAP,
    UPSTREAM_FETCH,
    VECTOR_ASSET_FETCH,
    fold_fts,
    intersect_filters,
    normalize_fts_score,
)

logger = logging.getLogger(__name__)


class SearchService:
    """Orchestrates a single cross-entity search query."""

    def __init__(
        self,
        asset_service: AssetService,
        actor_service: ActorService,
        rule_service: RuleService,
    ) -> None:
        self.asset_service = asset_service
        self.actor_service = actor_service
        self.rule_service = rule_service

    async def search(
        self,
        query: str,
        limit: int = 50,
        kinds: list[str] | None = None,
        types: list[str] | None = None,
    ) -> SearchResponse:
        """Return hits matching `query` across assets, actors, rules + schemas.

        The query supports a small DSL (see :py:mod:`query_parser`):

            ds:customers  p:Tom  "Q4"  -legacy

        Kind prefixes narrow the search, quoted phrases require a literal
        substring, `-term` excludes matches. Leftover bare words power the
        semantic vector search.

        Optional explicit filters:
        - `kinds`: only return hits of the listed kinds
          (`asset`/`actor`/`container`/`field`/`rule`). Intersects with
          any `kind:` prefixes the user typed — wizards that already
          know what's valid for a step pass this so a globally-ranked
          top-N can't squeeze the relevant kind out.
        - `types`: type filter applied based on the surviving kind:
          for `asset` this filters on `asset.type` (dataset / report /
          process / system / hierarchical members); for `actor` on
          `actor.type` (person / group); for `rule` on `severity`
          (info / warning / critical). Mixed-kind type filters are
          honoured per-kind — `kinds=asset,actor & types=dataset,person`
          works as expected.

        Results are **interleaved by cosine-similarity score** across all
        kinds — so "rules about PII" surfaces the right rule first even
        though rules are normally rendered after assets. Within any
        cluster of similar-score hits the classic asset→container→field→
        actor→rule order is preserved as a tiebreak so the visual
        grouping stays stable.
        """
        parsed = parse_query(query)
        if parsed.is_empty:
            return SearchResponse(items=[], total=0)

        # Text used for embedding: the remaining bare words *plus* any exact
        # phrases so semantic ranking is nudged toward them. Post-filtering
        # still enforces the exact substring.
        semantic_text = " ".join(
            [parsed.text, *parsed.exact_phrases]
        ).strip()
        allowed = parsed.allowed_kinds

        # Explicit `kinds` from the caller intersect with whatever the
        # query parser inferred. If the parser was unconstrained
        # (`allowed_kinds` defaulted to all), the explicit set wins
        # outright. If both sides constrained, we keep only the overlap
        # — a wizard saying "actor only" plus a user typing `ds:foo`
        # legitimately produces no hits and we shouldn't quietly fall
        # through to all actors.
        #
        # Filter the incoming list to known HitKind values so a typo
        # never widens the surface; unknown values are dropped silently
        # rather than 422'd because the route is also reachable from
        # plain link-clicks where strictness would only confuse users.
        if kinds:
            explicit_kinds: set[HitKind] = {
                k for k in kinds if k in _ALL_KINDS
            }
            if parsed.kinds:
                allowed = parsed.kinds & explicit_kinds
            else:
                allowed = explicit_kinds

        # Explicit `types`: split into per-kind buckets so each ranker
        # can apply its own filter independently. We intentionally don't
        # error on unknown values — callers may pass a mixed list (e.g.
        # `[\"dataset\",\"person\"]` for `kinds=[\"asset\",\"actor\"]`)
        # and we route each value to the bucket it maps to.
        explicit_asset_types: set[str] | None = None
        explicit_actor_types: set[str] | None = None
        explicit_severities: set[str] | None = None
        if types:
            asset_type_pool = {at.value for at in AssetType}
            actor_type_pool = {at.value for at in ActorType}
            severity_pool = {"info", "warning", "critical"}
            type_set = {t for t in types if t}
            asset_t = type_set & asset_type_pool
            actor_t = type_set & actor_type_pool
            sev_t = type_set & severity_pool
            if asset_t:
                explicit_asset_types = asset_t
            if actor_t:
                explicit_actor_types = actor_t
            if sev_t:
                explicit_severities = sev_t

        # Resolve graph-aware filters to sets of allowed uids. `None` means
        # "no filter"; an empty set means "the filter matched nothing, so
        # no hits survive". Asset-scoped filters get intersected together.
        owner_asset_uids = await self._assets_owned_by(parsed.owner)
        member_actor_uids = await self._members_of(parsed.member_of)
        uses_target_uids = await self._entities_using(parsed.uses)
        feeds_target_uids = await self._entities_feeding(parsed.feeds)
        rule_target_uids = await self._rules_for_asset(parsed.rule_for)

        # Intersect the asset-side filters so `owner:X uses:Y` means
        # "assets X owns AND that use Y", not a union.
        asset_scoped_uids = intersect_filters(
            owner_asset_uids, uses_target_uids, feeds_target_uids
        )

        # Graph filters imply a kind shortlist unless the user pinned one
        # explicitly. Each verb restricts to the kinds it can meaningfully
        # apply to:
        #   owner  → asset + schema (ownership is an asset property)
        #   feeds  → asset + schema (FEEDS is asset→asset)
        #   uses   → actor + asset + schema (USES comes from either)
        #   member → actor
        #   rule_for → rule
        # Multiple filters intersect their bundles — combined filters act
        # as AND, so `owner:X uses:Y` surfaces only the kinds both verbs
        # admit (assets + schema), not everything either verb would allow.
        if not parsed.kinds:
            bundles: list[set[str]] = []
            if parsed.owner:
                bundles.append({"asset", "container", "field"})
            if parsed.feeds:
                bundles.append({"asset", "container", "field"})
            if parsed.uses:
                bundles.append({"actor", "asset", "container", "field"})
            if parsed.member_of:
                bundles.append({"actor"})
            if parsed.rule_for:
                bundles.append({"rule"})
            if bundles:
                allowed = set(bundles[0])
                for b in bundles[1:]:
                    allowed &= b

        # Collect (hit, score, kind-order) tuples across every kind. The
        # kind-order index gives a stable tiebreak when two hits have
        # identical scores (common on the substring fallback).
        scored: list[tuple[SearchHit, float, int]] = []

        # --- Assets ----------------------------------------------------
        if "asset" in allowed:
            ranked_assets = await self._ranked_assets(semantic_text)
            if parsed.asset_type:
                ranked_assets = [
                    (a, s)
                    for a, s in ranked_assets
                    if (
                        a.type.value if hasattr(a.type, "value") else str(a.type)
                    )
                    == parsed.asset_type
                ]
            if explicit_asset_types is not None:
                ranked_assets = [
                    (a, s)
                    for a, s in ranked_assets
                    if (
                        a.type.value if hasattr(a.type, "value") else str(a.type)
                    )
                    in explicit_asset_types
                ]
            asset_count = 0
            for asset, asset_score in ranked_assets:
                if asset_count >= PER_KIND_CAP:
                    break
                if (
                    asset_scoped_uids is not None
                    and asset.uid not in asset_scoped_uids
                ):
                    continue
                if not passes_filters(asset_haystack(asset), parsed):
                    continue
                scored.append(
                    (
                        AssetHit(
                            uid=asset.uid,
                            name=asset.name,
                            description=asset.description,
                            type=asset.type,
                            status=asset.status,
                        ),
                        asset_score,
                        0,
                    )
                )
                asset_count += 1

        # --- Containers + Fields (their own vector + fulltext indexes) ----
        # Schema-node vector scores tend to run hot on vague queries
        # because each node's embedding text is enriched with path +
        # description + type (more surface than an asset name alone). We
        # apply a small discount so the parent asset usually wins when
        # both match semantically — but a strong literal FTS hit on a
        # column still floats past its parent via the hybrid boost.
        _CONTAINER_DISCOUNT = 0.85
        _FIELD_DISCOUNT = 0.80

        if "container" in allowed:
            ranked_containers = await rank_schema_nodes(
                self.asset_service.driver, "container", semantic_text
            )
            count = 0
            for hit, score in ranked_containers:
                if count >= PER_KIND_CAP:
                    break
                if (
                    asset_scoped_uids is not None
                    and hit.asset_uid not in asset_scoped_uids
                ):
                    continue
                if not passes_filters(
                    f"{hit.name} {hit.description or ''} {hit.path}".lower(),
                    parsed,
                ):
                    continue
                scored.append((hit, score * _CONTAINER_DISCOUNT, 1))
                count += 1

        if "field" in allowed:
            ranked_fields = await rank_schema_nodes(
                self.asset_service.driver, "field", semantic_text
            )
            count = 0
            for hit, score in ranked_fields:
                if count >= PER_KIND_CAP:
                    break
                if (
                    asset_scoped_uids is not None
                    and hit.asset_uid not in asset_scoped_uids
                ):
                    continue
                if not passes_filters(
                    f"{hit.name} {hit.description or ''} {hit.path}".lower(),
                    parsed,
                ):
                    continue
                scored.append((hit, score * _FIELD_DISCOUNT, 2))
                count += 1

        # --- Actors ----------------------------------------------------
        if "actor" in allowed:
            ranked_actors = await self._ranked_actors(semantic_text)
            if parsed.actor_type:
                ranked_actors = [
                    (a, s)
                    for a, s in ranked_actors
                    if (
                        a.type.value if hasattr(a.type, "value") else str(a.type)
                    )
                    == parsed.actor_type
                ]
            if explicit_actor_types is not None:
                ranked_actors = [
                    (a, s)
                    for a, s in ranked_actors
                    if (
                        a.type.value if hasattr(a.type, "value") else str(a.type)
                    )
                    in explicit_actor_types
                ]
            actor_count = 0
            for actor, score in ranked_actors:
                if actor_count >= PER_KIND_CAP:
                    break
                if (
                    member_actor_uids is not None
                    and actor.uid not in member_actor_uids
                ):
                    continue
                # `uses:` can match actor consumers too — the resolved set
                # is mixed (actor + asset uids) but that's fine: asset uids
                # simply won't equal any actor.uid, so the check stays
                # precise on the actor side.
                if (
                    uses_target_uids is not None
                    and actor.uid not in uses_target_uids
                ):
                    continue
                if not passes_filters(actor_haystack(actor), parsed):
                    continue
                scored.append(
                    (
                        ActorHit(
                            uid=actor.uid,
                            name=actor.name,
                            type=actor.type,
                            email=actor.email,
                            description=actor.description,
                        ),
                        score,
                        3,
                    )
                )
                actor_count += 1

        # --- Rules -----------------------------------------------------
        if "rule" in allowed:
            ranked_rules = await self._ranked_rules(semantic_text)
            if parsed.severity:
                ranked_rules = [
                    (r, s)
                    for r, s in ranked_rules
                    if (
                        r.severity.value
                        if hasattr(r.severity, "value")
                        else str(r.severity)
                    )
                    == parsed.severity
                ]
            if explicit_severities is not None:
                ranked_rules = [
                    (r, s)
                    for r, s in ranked_rules
                    if (
                        r.severity.value
                        if hasattr(r.severity, "value")
                        else str(r.severity)
                    )
                    in explicit_severities
                ]
            rule_count = 0
            for rule, score in ranked_rules:
                if rule_count >= PER_KIND_CAP:
                    break
                if (
                    rule_target_uids is not None
                    and rule.uid not in rule_target_uids
                ):
                    continue
                if not passes_filters(rule_haystack(rule), parsed):
                    continue
                scored.append(
                    (
                        RuleHit(
                            uid=rule.uid,
                            name=rule.name,
                            description=rule.description,
                            severity=rule.severity,
                            category=rule.category,
                        ),
                        score,
                        4,
                    )
                )
                rule_count += 1

        # Sort by score desc, then by kind-order asc as a stable tiebreak.
        scored.sort(key=lambda t: (-t[1], t[2]))
        items: list[SearchHit] = [hit for hit, _s, _k in scored[:limit]]
        return SearchResponse(items=items, total=len(scored))

    # ------------------------------------------------------------------
    # Per-kind hybrid rankers
    # ------------------------------------------------------------------

    async def _ranked_assets(
        self, query: str
    ) -> list[tuple[Any, float]]:
        """Hybrid vector + fulltext ranker for assets, with substring fallback."""
        if not query.strip():
            page = await self.asset_service.list(limit=UPSTREAM_FETCH, offset=0)
            return [(a, NEUTRAL_SCORE) for a in page.items]

        vector_hits: dict[str, tuple[Any, float]] = {}
        fts_matches: dict[str, float] = {}

        try:
            vector = EmbeddingService.instance().embed_one(query)
            v_hits = await self.asset_service.asset_repo.search_by_vector(
                vector, limit=VECTOR_ASSET_FETCH
            )
            for asset, score in v_hits:
                vector_hits[asset.uid] = (asset, score)
        except Exception:
            logger.exception("Vector search failed for assets '%s'", query)

        try:
            t_hits = await self.asset_service.asset_repo.search_by_text(
                query, limit=PER_KIND_CAP
            )
            for asset, raw_score in t_hits:
                norm = normalize_fts_score(raw_score)
                fts_matches[asset.uid] = norm
                # FTS-only hits aren't in the vector dict — add them with a
                # synthetic vector score of 0 so fold_fts keeps them.
                vector_hits.setdefault(asset.uid, (asset, 0.0))
        except Exception:
            logger.exception("Fulltext search failed for assets '%s'", query)

        merged = fold_fts(vector_hits, fts_matches)
        if merged:
            return sorted(merged.values(), key=lambda t: -t[1])

        needle = query.strip().lower()
        asset_page = await self.asset_service.list(limit=UPSTREAM_FETCH, offset=0)
        return [
            (asset, NEUTRAL_SCORE)
            for asset in asset_page.items
            if matches(
                needle,
                asset.name,
                asset.description,
                asset.type.value if hasattr(asset.type, "value") else str(asset.type),
                asset.status.value
                if hasattr(asset.status, "value")
                else str(asset.status),
            )
        ]

    async def _ranked_actors(self, query: str) -> list[tuple[Any, float]]:
        """Hybrid vector + fulltext ranker for actors, with substring fallback."""
        if not query.strip():
            page = await self.actor_service.list(limit=UPSTREAM_FETCH, offset=0)
            return [(a, NEUTRAL_SCORE) for a in page.items]

        vector_hits: dict[str, tuple[Any, float]] = {}
        fts_matches: dict[str, float] = {}

        try:
            vector = EmbeddingService.instance().embed_one(query)
            v_hits = await self.actor_service.actor_repo.search_by_vector(
                vector, limit=PER_KIND_CAP
            )
            for actor, score in v_hits:
                vector_hits[actor.uid] = (actor, score)
        except Exception:
            logger.exception("Vector search failed for actors '%s'", query)

        try:
            t_hits = await self.actor_service.actor_repo.search_by_text(
                query, limit=PER_KIND_CAP
            )
            for actor, raw_score in t_hits:
                norm = normalize_fts_score(raw_score)
                fts_matches[actor.uid] = norm
                vector_hits.setdefault(actor.uid, (actor, 0.0))
        except Exception:
            logger.exception("Fulltext search failed for actors '%s'", query)

        merged = fold_fts(vector_hits, fts_matches)
        if merged:
            return sorted(merged.values(), key=lambda t: -t[1])

        needle = query.strip().lower()
        actor_page = await self.actor_service.list(limit=UPSTREAM_FETCH, offset=0)
        return [
            (actor, NEUTRAL_SCORE)
            for actor in actor_page.items
            if matches(
                needle,
                actor.name,
                actor.description,
                actor.email,
                actor.type.value if hasattr(actor.type, "value") else str(actor.type),
            )
        ]

    async def _ranked_rules(self, query: str) -> list[tuple[Any, float]]:
        """Hybrid vector + fulltext ranker for rules, with substring fallback."""
        if not query.strip():
            page = await self.rule_service.list(limit=UPSTREAM_FETCH, offset=0)
            return [(r, NEUTRAL_SCORE) for r in page.items]

        vector_hits: dict[str, tuple[Any, float]] = {}
        fts_matches: dict[str, float] = {}

        try:
            vector = EmbeddingService.instance().embed_one(query)
            v_hits = await self.rule_service.rule_repo.search_by_vector(
                vector, limit=PER_KIND_CAP
            )
            for rule, score in v_hits:
                vector_hits[rule.uid] = (rule, score)
        except Exception:
            logger.exception("Vector search failed for rules '%s'", query)

        try:
            t_hits = await self.rule_service.rule_repo.search_by_text(
                query, limit=PER_KIND_CAP
            )
            for rule, raw_score in t_hits:
                norm = normalize_fts_score(raw_score)
                fts_matches[rule.uid] = norm
                vector_hits.setdefault(rule.uid, (rule, 0.0))
        except Exception:
            logger.exception("Fulltext search failed for rules '%s'", query)

        merged = fold_fts(vector_hits, fts_matches)
        if merged:
            return sorted(merged.values(), key=lambda t: -t[1])

        needle = query.strip().lower()
        rule_page = await self.rule_service.list(limit=UPSTREAM_FETCH, offset=0)
        return [
            (rule, NEUTRAL_SCORE)
            for rule in rule_page.items
            if matches(
                needle,
                rule.name,
                rule.description,
                rule.category,
                rule.severity.value
                if hasattr(rule.severity, "value")
                else str(rule.severity),
            )
        ]

    # ------------------------------------------------------------------
    # Graph-aware filter resolvers
    # ------------------------------------------------------------------

    async def _resolve_actor_uids(self, name_query: str) -> list[str]:
        """Find actor uids whose name/description best matches the query.

        Used for graph-aware filters (`owner:`, `member:`). FTS is noisy
        on short queries — "Rebel" matches half the catalog — so we only
        accept hits whose score is within 60% of the top hit. That keeps
        `owner:leia` precise (Leia wins, nobody else is close) while
        still allowing `owner:"Fleet Ops"` to match both "Fleet
        Operations" and its shorthand.
        """
        hits = await self.actor_service.actor_repo.search_by_text(
            name_query, limit=10
        )
        if not hits:
            return []
        top_score = hits[0][1]
        threshold = top_score * 0.6
        return [a.uid for a, s in hits if s >= threshold]

    async def _assets_owned_by(
        self, owner_query: str | None
    ) -> set[str] | None:
        """Resolve the `owner:<name>` filter to a set of asset uids. None
        means no filter; empty set means "nothing matched, so bail"."""
        if not owner_query:
            return None
        actor_uids = await self._resolve_actor_uids(owner_query)
        if not actor_uids:
            return set()
        cypher = """
            MATCH (a:Asset)<-[:OWNS]-(owner:Actor)
            WHERE owner.uid IN $uids
            RETURN a.uid AS uid
            UNION
            MATCH (a:Asset)<-[:OWNS]-(team:Actor)<-[:MEMBER_OF]-(person:Actor)
            WHERE person.uid IN $uids
            RETURN a.uid AS uid
        """
        async with self.asset_service.driver.session() as session:
            result = await session.run(cypher, {"uids": actor_uids})
            rows = await result.data()
        return {r["uid"] for r in rows}

    async def _members_of(self, team_query: str | None) -> set[str] | None:
        """Resolve the `member:<team-name>` filter to actor uids."""
        if not team_query:
            return None
        team_uids = await self._resolve_actor_uids(team_query)
        if not team_uids:
            return set()
        cypher = """
            MATCH (person:Actor)-[:MEMBER_OF]->(team:Actor)
            WHERE team.uid IN $uids
            RETURN person.uid AS uid
            UNION
            MATCH (team:Actor)
            WHERE team.uid IN $uids
            RETURN team.uid AS uid
        """
        async with self.asset_service.driver.session() as session:
            result = await session.run(cypher, {"uids": team_uids})
            rows = await result.data()
        return {r["uid"] for r in rows}

    async def _resolve_asset_uids(self, name_query: str) -> list[str]:
        """Best-match asset uids for a free-text filter value. Same
        60%-of-top-score threshold as _resolve_actor_uids so short names
        stay precise (e.g. `uses:"marts.imperial_movements"`)."""
        hits = await self.asset_service.asset_repo.search_by_text(
            name_query, limit=10
        )
        if not hits:
            return []
        top_score = hits[0][1]
        threshold = top_score * 0.6
        return [a.uid for a, s in hits if s >= threshold]

    async def _entities_using(
        self, target_query: str | None
    ) -> set[str] | None:
        """Resolve the `uses:<name>` filter to entity uids that have a
        USES relation pointing at the target(s). Covers both actor →
        asset and asset → asset uses."""
        if not target_query:
            return None
        target_uids = await self._resolve_asset_uids(target_query)
        if not target_uids:
            return set()
        cypher = """
            MATCH (n)-[:USES]->(t)
            WHERE t.uid IN $uids
            RETURN n.uid AS uid
        """
        async with self.asset_service.driver.session() as session:
            result = await session.run(cypher, {"uids": target_uids})
            rows = await result.data()
        return {r["uid"] for r in rows}

    async def _entities_feeding(
        self, target_query: str | None
    ) -> set[str] | None:
        """Resolve the `feeds:<name>` filter to upstream asset uids —
        anything with a FEEDS → target edge. Processes participate as
        regular asset nodes, so a process that feeds the target shows up
        naturally via this single pattern."""
        if not target_query:
            return None
        target_uids = await self._resolve_asset_uids(target_query)
        if not target_uids:
            return set()
        cypher = """
            MATCH (n:Asset)-[:FEEDS]->(t)
            WHERE t.uid IN $uids
            RETURN n.uid AS uid
        """
        async with self.asset_service.driver.session() as session:
            result = await session.run(cypher, {"uids": target_uids})
            rows = await result.data()
        return {r["uid"] for r in rows}

    async def _rules_for_asset(
        self, target_query: str | None
    ) -> set[str] | None:
        """Resolve `rule_for:<asset-name>` → rule uids with an
        APPLIES_TO edge to the matched asset(s)."""
        if not target_query:
            return None
        target_uids = await self._resolve_asset_uids(target_query)
        if not target_uids:
            return set()
        cypher = """
            MATCH (r:Rule)-[:APPLIES_TO]->(a:Asset)
            WHERE a.uid IN $uids
            RETURN r.uid AS uid
        """
        async with self.asset_service.driver.session() as session:
            result = await session.run(cypher, {"uids": target_uids})
            rows = await result.data()
        return {r["uid"] for r in rows}
