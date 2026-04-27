"""Integration tests for auto-discovery fields (verified, discovered_by) and client-supplied UIDs."""

import pytest
from httpx import AsyncClient


class TestAssetAutoDiscovery:
    """Reader-style asset creation with verified/discovered_by/uid."""

    async def test_default_create_is_verified(self, client: AsyncClient) -> None:
        """A direct API create defaults to verified=True with no discovered_by."""
        resp = await client.post(
            "/api/v1/assets",
            json={"type": "dataset", "name": "Manual Asset"},
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["verified"] is True
        assert body["discovered_by"] is None

    async def test_reader_create_is_unverified(self, client: AsyncClient) -> None:
        """A reader can create an unverified asset with provenance string."""
        resp = await client.post(
            "/api/v1/assets",
            json={
                "type": "dataset",
                "name": "Discovered Asset",
                "verified": False,
                "discovered_by": "excel-connector@0.1.0",
            },
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["verified"] is False
        assert body["discovered_by"] == "excel-connector@0.1.0"

    async def test_create_with_explicit_uid(self, client: AsyncClient) -> None:
        """Client-supplied uid is honored (idempotency primitive)."""
        explicit_uid = "excel-fixture-deterministic-123"
        resp = await client.post(
            "/api/v1/assets",
            json={
                "uid": explicit_uid,
                "type": "dataset",
                "name": "Idempotent Asset",
            },
        )
        assert resp.status_code == 201
        assert resp.json()["uid"] == explicit_uid

        # Second create with same uid should fail (current behavior — no upsert)
        # The connector handles this by GET-then-PUT; here we just confirm the
        # primitive doesn't silently overwrite.
        # The create raises a Cypher constraint violation; expect 4xx/5xx.
        resp2 = await client.post(
            "/api/v1/assets",
            json={
                "uid": explicit_uid,
                "type": "dataset",
                "name": "Should Conflict",
            },
        )
        assert resp2.status_code >= 400

    async def test_update_can_promote_to_verified(self, client: AsyncClient) -> None:
        """A human (or admin endpoint) can flip verified=true on a discovered asset."""
        create = await client.post(
            "/api/v1/assets",
            json={
                "type": "dataset",
                "name": "To Be Verified",
                "verified": False,
                "discovered_by": "excel-connector@0.1.0",
            },
        )
        uid = create.json()["uid"]

        update = await client.put(
            f"/api/v1/assets/{uid}",
            json={"verified": True},
        )
        assert update.status_code == 200
        assert update.json()["verified"] is True
        # discovered_by is preserved (the provenance doesn't disappear when verified)
        assert update.json()["discovered_by"] == "excel-connector@0.1.0"


class TestActorAutoDiscovery:
    """Reader-style actor creation."""

    async def test_default_actor_is_verified(self, client: AsyncClient) -> None:
        resp = await client.post(
            "/api/v1/actors",
            json={"type": "person", "name": "Manual Person"},
        )
        assert resp.status_code == 201
        assert resp.json()["verified"] is True

    async def test_reader_actor_is_unverified(self, client: AsyncClient) -> None:
        resp = await client.post(
            "/api/v1/actors",
            json={
                "type": "person",
                "name": "Discovered Person",
                "email": "discovered@example.com",
                "verified": False,
                "discovered_by": "excel-connector@0.1.0",
            },
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["verified"] is False
        assert body["discovered_by"] == "excel-connector@0.1.0"


@pytest.fixture
async def two_assets(client: AsyncClient) -> tuple[str, str]:
    """Helper: create two assets and return their UIDs."""
    a = await client.post("/api/v1/assets", json={"type": "dataset", "name": "Source"})
    b = await client.post("/api/v1/assets", json={"type": "dataset", "name": "Target"})
    return a.json()["uid"], b.json()["uid"]


class TestRelationAutoDiscovery:
    """Reader-style relation creation."""

    async def test_default_relation_is_verified(
        self, client: AsyncClient, two_assets: tuple[str, str]
    ) -> None:
        a, b = two_assets
        resp = await client.post(
            "/api/v1/relations",
            json={"from_uid": a, "to_uid": b, "type": "feeds"},
        )
        assert resp.status_code == 201
        assert resp.json()["verified"] is True

    async def test_reader_relation_is_unverified(
        self, client: AsyncClient, two_assets: tuple[str, str]
    ) -> None:
        a, b = two_assets
        resp = await client.post(
            "/api/v1/relations",
            json={
                "from_uid": a,
                "to_uid": b,
                "type": "feeds",
                "verified": False,
                "discovered_by": "excel-connector@0.1.0",
            },
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["verified"] is False
        assert body["discovered_by"] == "excel-connector@0.1.0"
