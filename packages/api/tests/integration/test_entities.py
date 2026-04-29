"""Integration tests for the polymorphic `/entities/{uid}` resolver."""

from httpx import AsyncClient


class TestEntityResolver:
    """`GET /api/v1/entities/{uid}` resolves any node to its typed payload."""

    async def test_resolves_asset(self, client: AsyncClient) -> None:
        """An Asset uid returns `kind=asset` with the full asset payload."""
        create = await client.post(
            "/api/v1/assets", json={"type": "dataset", "name": "Sales"}
        )
        uid = create.json()["uid"]

        response = await client.get(f"/api/v1/entities/{uid}")

        assert response.status_code == 200
        body = response.json()
        assert body["kind"] == "asset"
        assert body["asset"]["uid"] == uid
        assert body["asset"]["name"] == "Sales"
        assert body["asset"]["type"] == "dataset"

    async def test_resolves_actor(self, client: AsyncClient) -> None:
        """An Actor uid returns `kind=actor`."""
        create = await client.post(
            "/api/v1/actors", json={"type": "person", "name": "Sam"}
        )
        uid = create.json()["uid"]

        response = await client.get(f"/api/v1/entities/{uid}")

        assert response.status_code == 200
        body = response.json()
        assert body["kind"] == "actor"
        assert body["actor"]["uid"] == uid
        assert body["actor"]["name"] == "Sam"

    async def test_resolves_rule(self, client: AsyncClient) -> None:
        """A Rule uid returns `kind=rule`."""
        create = await client.post(
            "/api/v1/rules",
            json={"name": "PII redacted", "description": "All PII must be redacted."},
        )
        uid = create.json()["uid"]

        response = await client.get(f"/api/v1/entities/{uid}")

        assert response.status_code == 200
        body = response.json()
        assert body["kind"] == "rule"
        assert body["rule"]["uid"] == uid
        assert body["rule"]["name"] == "PII redacted"

    async def test_unknown_uid_returns_404(self, client: AsyncClient) -> None:
        response = await client.get("/api/v1/entities/no-such-thing")
        assert response.status_code == 404
        assert response.json()["error"] == "not_found"

    async def test_resolver_does_not_match_relation_uid(
        self, client: AsyncClient
    ) -> None:
        """Relations have uids too but aren't first-class entities — 404 is correct.

        This guards the WHERE filter against accidentally surfacing a
        relation node as if it were an entity.
        """
        # Create two assets and a relation between them.
        a = await client.post(
            "/api/v1/assets", json={"type": "dataset", "name": "src"}
        )
        b = await client.post(
            "/api/v1/assets", json={"type": "dataset", "name": "dst"}
        )
        rel = await client.post(
            "/api/v1/relations",
            json={
                "from_uid": a.json()["uid"],
                "to_uid": b.json()["uid"],
                "type": "feeds",
            },
        )
        rel_uid = rel.json()["uid"]

        response = await client.get(f"/api/v1/entities/{rel_uid}")
        assert response.status_code == 404
