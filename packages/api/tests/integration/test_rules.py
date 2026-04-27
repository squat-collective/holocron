"""Integration tests for rule CRUD + APPLIES_TO relations with enforcement tiers."""

import pytest
from httpx import AsyncClient


class TestRuleCRUD:
    """Basic create / read / update / delete + filtering."""

    async def test_create_rule_defaults_to_warning(self, client: AsyncClient) -> None:
        resp = await client.post(
            "/api/v1/rules",
            json={
                "name": "Prices positive",
                "description": "The price column must never be negative.",
            },
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["name"] == "Prices positive"
        assert body["severity"] == "warning"
        assert body["verified"] is True

    async def test_create_rule_with_all_fields(self, client: AsyncClient) -> None:
        resp = await client.post(
            "/api/v1/rules",
            json={
                "name": "No PII in analytics",
                "description": "Analytics tables must never include raw PII columns.",
                "severity": "critical",
                "category": "privacy",
            },
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["severity"] == "critical"
        assert body["category"] == "privacy"

    async def test_get_rule(self, client: AsyncClient) -> None:
        create = await client.post(
            "/api/v1/rules",
            json={"name": "Freshness", "description": "Max 24h old."},
        )
        uid = create.json()["uid"]
        fetch = await client.get(f"/api/v1/rules/{uid}")
        assert fetch.status_code == 200
        assert fetch.json()["name"] == "Freshness"

    async def test_update_rule_severity(self, client: AsyncClient) -> None:
        create = await client.post(
            "/api/v1/rules",
            json={"name": "Rowcount range", "description": "900-1100"},
        )
        uid = create.json()["uid"]
        update = await client.put(
            f"/api/v1/rules/{uid}", json={"severity": "critical"}
        )
        assert update.status_code == 200
        assert update.json()["severity"] == "critical"

    async def test_list_rules_by_category(self, client: AsyncClient) -> None:
        await client.post(
            "/api/v1/rules",
            json={"name": "R1", "description": "d", "category": "privacy"},
        )
        await client.post(
            "/api/v1/rules",
            json={"name": "R2", "description": "d", "category": "freshness"},
        )
        await client.post(
            "/api/v1/rules",
            json={"name": "R3", "description": "d", "category": "privacy"},
        )
        resp = await client.get("/api/v1/rules?category=privacy")
        assert resp.status_code == 200
        items = resp.json()["items"]
        assert len(items) == 2
        assert all(r["category"] == "privacy" for r in items)

    async def test_delete_rule(self, client: AsyncClient) -> None:
        create = await client.post(
            "/api/v1/rules", json={"name": "tmp", "description": "d"}
        )
        uid = create.json()["uid"]
        delete = await client.delete(f"/api/v1/rules/{uid}")
        assert delete.status_code == 204
        fetch = await client.get(f"/api/v1/rules/{uid}")
        assert fetch.status_code == 404


class TestAppliesToRelation:
    """Rule → Asset via APPLIES_TO with enforcement lives on the relation's properties."""

    @pytest.fixture
    async def rule_uid(self, client: AsyncClient) -> str:
        resp = await client.post(
            "/api/v1/rules",
            json={
                "name": "Prices positive",
                "description": "Must be >= 0",
                "severity": "critical",
                "category": "integrity",
            },
        )
        return resp.json()["uid"]

    @pytest.fixture
    async def two_assets(self, client: AsyncClient) -> tuple[str, str]:
        prod = await client.post(
            "/api/v1/assets", json={"type": "dataset", "name": "prod_sales"}
        )
        legacy = await client.post(
            "/api/v1/assets", json={"type": "dataset", "name": "legacy_dump"}
        )
        return prod.json()["uid"], legacy.json()["uid"]

    async def test_same_rule_different_enforcement_per_asset(
        self,
        client: AsyncClient,
        rule_uid: str,
        two_assets: tuple[str, str],
    ) -> None:
        """This is the core: same rule, different enforcement tiers across assets."""
        prod_uid, legacy_uid = two_assets

        # Enforced on prod
        prod_rel = await client.post(
            "/api/v1/relations",
            json={
                "from_uid": rule_uid,
                "to_uid": prod_uid,
                "type": "applies_to",
                "properties": {"enforcement": "enforced"},
            },
        )
        assert prod_rel.status_code == 201

        # Documented only on legacy
        legacy_rel = await client.post(
            "/api/v1/relations",
            json={
                "from_uid": rule_uid,
                "to_uid": legacy_uid,
                "type": "applies_to",
                "properties": {
                    "enforcement": "documented",
                    "note": "Dump — we know we should enforce but no runner yet",
                },
            },
        )
        assert legacy_rel.status_code == 201

        # Relations readable with different enforcement on each
        listing = await client.get(
            f"/api/v1/relations?type=applies_to&from_uid={rule_uid}"
        )
        assert listing.status_code == 200
        items = listing.json()["items"]
        enforcements = {r["properties"]["enforcement"] for r in items}
        assert enforcements == {"enforced", "documented"}

    async def test_field_path_targets_schema_node(
        self,
        client: AsyncClient,
        rule_uid: str,
        two_assets: tuple[str, str],
    ) -> None:
        """Granular targeting: rule applies to a specific field via field_path."""
        prod_uid, _ = two_assets
        rel = await client.post(
            "/api/v1/relations",
            json={
                "from_uid": rule_uid,
                "to_uid": prod_uid,
                "type": "applies_to",
                "properties": {
                    "enforcement": "alerting",
                    "field_path": "Sales/SalesTable/price",
                },
            },
        )
        assert rel.status_code == 201
        assert rel.json()["properties"]["field_path"] == "Sales/SalesTable/price"
