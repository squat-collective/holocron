"""Unit tests for the renderer + bundle.

We don't spin up an API for these — the plugin's `run()` entry point
takes a snapshot it builds itself, but the renderer is a pure function
of `CatalogSnapshot`, so we feed it fixtures directly. That keeps the
tests fast and deterministic.
"""

from __future__ import annotations

import io
import zipfile
from datetime import UTC, datetime

from data_dictionary_markdown.bundle import write_dictionary_zip
from data_dictionary_markdown.models import (
    ActorRecord,
    AssetRecord,
    CatalogSnapshot,
    RelationRecord,
)
from data_dictionary_markdown.render import (
    RelationIndex,
    actor_path,
    asset_path,
    render_actor,
    render_asset,
    render_readme,
    slugify,
)

NOW = datetime(2026, 4, 25, 12, 0, 0, tzinfo=UTC)


def _asset(uid: str, **overrides: object) -> AssetRecord:
    base = {
        "uid": uid,
        "type": "dataset",
        "name": uid,
        "status": "active",
        "verified": True,
        "created_at": NOW,
        "updated_at": NOW,
    }
    base.update(overrides)  # type: ignore[arg-type]
    return AssetRecord.model_validate(base)


def _actor(uid: str, **overrides: object) -> ActorRecord:
    base = {
        "uid": uid,
        "type": "person",
        "name": uid,
        "verified": True,
        "created_at": NOW,
        "updated_at": NOW,
    }
    base.update(overrides)  # type: ignore[arg-type]
    return ActorRecord.model_validate(base)


def _relation(from_uid: str, to_uid: str, type_: str) -> RelationRecord:
    return RelationRecord.model_validate(
        {
            "uid": f"rel-{from_uid}-{type_}-{to_uid}",
            "from_uid": from_uid,
            "to_uid": to_uid,
            "type": type_,
            "verified": True,
            "created_at": NOW,
        }
    )


# ---------- slugify ----------


class TestSlugify:
    def test_lowercases_and_dashes_words(self) -> None:
        assert slugify("Sales Data 2026", "fallback") == "sales-data-2026"

    def test_strips_punctuation(self) -> None:
        assert slugify("Customers (PII!)", "fallback") == "customers-pii"

    def test_falls_back_when_name_is_all_punctuation(self) -> None:
        # An all-punctuation name would otherwise produce an empty string
        # — the fallback uid keeps filenames unique.
        assert slugify("!!!", "asset-123") == "asset-123"

    def test_collapses_consecutive_separators(self) -> None:
        assert slugify("a   b___c", "fallback") == "a-b-c"


# ---------- render_asset ----------


class TestRenderAsset:
    def test_minimal_asset_has_heading_and_uid(self) -> None:
        asset = _asset("asset-1", name="Customers")
        idx = RelationIndex.build(CatalogSnapshot(fetched_at=NOW, assets=[asset]))

        out = render_asset(asset, idx)

        assert out.startswith("# Customers\n")
        assert "`asset-1`" in out
        assert out.endswith("\n")

    def test_owners_section_links_to_actor_pages(self) -> None:
        asset = _asset("asset-1", name="Customers")
        actor = _actor("actor-1", name="Sam Owner", email="sam@example.com")
        owns = _relation("actor-1", "asset-1", "owns")
        idx = RelationIndex.build(
            CatalogSnapshot(
                fetched_at=NOW, assets=[asset], actors=[actor], relations=[owns]
            )
        )

        out = render_asset(asset, idx)

        assert "## Owners" in out
        # Relative link from assets/* up to actors/* — the bundle is
        # browseable as a static site, so the path needs to traverse out.
        assert "[Sam Owner](../actors/sam-owner.md)" in out

    def test_lineage_section_separates_upstream_and_downstream(self) -> None:
        a = _asset("a")
        b = _asset("b")
        c = _asset("c")
        # b feeds a, a feeds c → from a's perspective: b upstream, c downstream
        b_feeds_a = _relation("b", "a", "feeds")
        a_feeds_c = _relation("a", "c", "feeds")
        idx = RelationIndex.build(
            CatalogSnapshot(
                fetched_at=NOW, assets=[a, b, c], relations=[b_feeds_a, a_feeds_c]
            )
        )

        out = render_asset(a, idx)

        assert "## Lineage" in out
        # Both upstream + downstream sections present.
        assert "**Upstream:**" in out
        assert "**Downstream:**" in out
        # Upstream block mentions b, downstream block mentions c.
        upstream_section = out.split("**Upstream:**")[1].split("**Downstream:**")[0]
        downstream_section = out.split("**Downstream:**")[1]
        assert "b" in upstream_section and "c" not in upstream_section
        assert "c" in downstream_section

    def test_uses_relation_counts_as_upstream(self) -> None:
        # `uses` (a uses b) → b is upstream from a's perspective.
        a = _asset("a")
        b = _asset("b")
        idx = RelationIndex.build(
            CatalogSnapshot(
                fetched_at=NOW, assets=[a, b], relations=[_relation("a", "b", "uses")]
            )
        )
        out = render_asset(a, idx)
        assert "**Upstream:**" in out
        upstream_section = out.split("**Upstream:**")[1]
        assert "b" in upstream_section

    def test_schema_renders_as_nested_bullets(self) -> None:
        schema = [
            {
                "id": "n1",
                "name": "Customers",
                "nodeType": "container",
                "containerType": "table",
                "children": [
                    {
                        "id": "n2",
                        "name": "email",
                        "nodeType": "field",
                        "dataType": "string",
                        "pii": True,
                    }
                ],
            }
        ]
        asset = _asset("a", metadata={"schema": schema})
        idx = RelationIndex.build(CatalogSnapshot(fetched_at=NOW, assets=[asset]))

        out = render_asset(asset, idx)

        assert "## Schema" in out
        assert "**Customers**" in out
        assert "email" in out
        assert "🔒 PII" in out

    def test_custom_metadata_block_excludes_schema_and_specs(self) -> None:
        # `tool` is a known spec key (rendered in front-matter); `team`
        # isn't (rendered as custom metadata). `schema` is structured and
        # has its own dedicated section.
        asset = _asset(
            "a",
            metadata={
                "tool": "looker",
                "team": "growth",
                "schema": [],
            },
        )
        idx = RelationIndex.build(CatalogSnapshot(fetched_at=NOW, assets=[asset]))

        out = render_asset(asset, idx)

        # Metadata block is JSON. The team field shows up there; schema and
        # tool don't.
        assert "## Metadata" in out
        meta_block = out.split("## Metadata")[1]
        assert '"team"' in meta_block
        assert '"tool"' not in meta_block
        assert '"schema"' not in meta_block

    def test_unverified_asset_shows_red_x_in_frontmatter(self) -> None:
        asset = _asset("a", verified=False, discovered_by="csv-connector@0.1.0")
        idx = RelationIndex.build(CatalogSnapshot(fetched_at=NOW, assets=[asset]))
        out = render_asset(asset, idx)
        assert "❌" in out
        assert "csv-connector@0.1.0" in out


# ---------- render_actor ----------


class TestRenderActor:
    def test_actor_with_owned_assets_lists_them(self) -> None:
        actor = _actor("a1", name="Sam")
        owned = _asset("ds1", name="Sales Data")
        idx = RelationIndex.build(
            CatalogSnapshot(
                fetched_at=NOW,
                assets=[owned],
                actors=[actor],
                relations=[_relation("a1", "ds1", "owns")],
            )
        )

        out = render_actor(actor, idx)

        assert "## Owns" in out
        # Asset → asset link from actor page is `../assets/<slug>.md`.
        assert "[Sales Data](../assets/sales-data.md)" in out

    def test_actor_email_in_frontmatter_when_present(self) -> None:
        actor = _actor("a1", email="a@b.c")
        idx = RelationIndex.build(CatalogSnapshot(fetched_at=NOW, actors=[actor]))
        out = render_actor(actor, idx)
        assert "a@b.c" in out


# ---------- render_readme ----------


class TestRenderReadme:
    def test_includes_counts(self) -> None:
        snap = CatalogSnapshot(
            fetched_at=NOW,
            assets=[_asset("a"), _asset("b")],
            actors=[_actor("c")],
            relations=[_relation("c", "a", "owns")],
        )
        out = render_readme(snap)
        assert "**Assets:** 2" in out
        assert "**Actors:** 1" in out
        assert "**Relations:** 1" in out

    def test_unverified_marker_in_index(self) -> None:
        snap = CatalogSnapshot(
            fetched_at=NOW, assets=[_asset("a", verified=False)]
        )
        out = render_readme(snap)
        assert "*(unverified)*" in out


# ---------- write_dictionary_zip ----------


class TestWriteDictionaryZip:
    def test_zip_contains_readme_and_per_entity_pages(self) -> None:
        snap = CatalogSnapshot(
            fetched_at=NOW,
            assets=[_asset("a", name="Sales Data")],
            actors=[_actor("p", name="Sam Owner")],
        )

        body = write_dictionary_zip(snap)

        with zipfile.ZipFile(io.BytesIO(body)) as zf:
            names = set(zf.namelist())

        assert "README.md" in names
        assert "assets/sales-data.md" in names
        assert "actors/sam-owner.md" in names

    def test_zip_is_deterministic_for_equal_snapshots(self) -> None:
        # Same input snapshot → same paths/content. Bytes can differ
        # because zip stores per-file mtimes from the system clock; but
        # the *layout* must be stable so reviewers see meaningful diffs.
        snap = CatalogSnapshot(fetched_at=NOW, assets=[_asset("a")])
        body_a = write_dictionary_zip(snap)
        body_b = write_dictionary_zip(snap)
        with zipfile.ZipFile(io.BytesIO(body_a)) as za, zipfile.ZipFile(io.BytesIO(body_b)) as zb:
            assert za.namelist() == zb.namelist()
            for name in za.namelist():
                assert za.read(name) == zb.read(name)


# ---------- path helpers ----------


class TestPaths:
    def test_asset_path_uses_slug(self) -> None:
        assert asset_path(_asset("uid-1", name="Sales Data")) == "assets/sales-data.md"

    def test_actor_path_uses_slug(self) -> None:
        assert actor_path(_actor("uid-1", name="Sam Owner")) == "actors/sam-owner.md"
