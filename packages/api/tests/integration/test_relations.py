"""Integration tests for Relation API endpoints."""

from httpx import AsyncClient


class TestCreateRelation:
    """Tests for POST /api/v1/relations."""

    async def test_create_owns_relation_returns_201(self, client: AsyncClient) -> None:
        """Creating an OWNS relation should return 201."""
        # Create actor and asset first
        actor = await client.post(
            "/api/v1/actors",
            json={"type": "person", "name": "Alice"},
        )
        asset = await client.post(
            "/api/v1/assets",
            json={"type": "dataset", "name": "Sales Data"},
        )

        payload = {
            "from_uid": actor.json()["uid"],
            "to_uid": asset.json()["uid"],
            "type": "owns",
        }

        response = await client.post("/api/v1/relations", json=payload)

        assert response.status_code == 201
        data = response.json()
        assert data["from_uid"] == actor.json()["uid"]
        assert data["to_uid"] == asset.json()["uid"]
        assert data["type"] == "owns"
        assert "uid" in data

    async def test_create_feeds_relation_returns_201(self, client: AsyncClient) -> None:
        """Creating a FEEDS relation between assets should return 201."""
        # Create two assets
        dataset = await client.post(
            "/api/v1/assets",
            json={"type": "dataset", "name": "Raw Data"},
        )
        report = await client.post(
            "/api/v1/assets",
            json={"type": "report", "name": "Dashboard"},
        )

        payload = {
            "from_uid": dataset.json()["uid"],
            "to_uid": report.json()["uid"],
            "type": "feeds",
        }

        response = await client.post("/api/v1/relations", json=payload)

        assert response.status_code == 201
        assert response.json()["type"] == "feeds"

    async def test_create_relation_with_properties_returns_201(
        self, client: AsyncClient
    ) -> None:
        """Creating a relation with properties should return 201."""
        actor = await client.post(
            "/api/v1/actors",
            json={"type": "person", "name": "Bob"},
        )
        asset = await client.post(
            "/api/v1/assets",
            json={"type": "report", "name": "Weekly Report"},
        )

        payload = {
            "from_uid": actor.json()["uid"],
            "to_uid": asset.json()["uid"],
            "type": "uses",
            "properties": {"frequency": "weekly", "purpose": "analysis"},
        }

        response = await client.post("/api/v1/relations", json=payload)

        assert response.status_code == 201
        assert response.json()["properties"]["frequency"] == "weekly"

    async def test_create_relation_invalid_type_returns_422(
        self, client: AsyncClient
    ) -> None:
        """Creating a relation with invalid type should return 422."""
        actor = await client.post(
            "/api/v1/actors",
            json={"type": "person", "name": "Test"},
        )
        asset = await client.post(
            "/api/v1/assets",
            json={"type": "dataset", "name": "Test"},
        )

        payload = {
            "from_uid": actor.json()["uid"],
            "to_uid": asset.json()["uid"],
            "type": "invalid_relation",
        }

        response = await client.post("/api/v1/relations", json=payload)

        assert response.status_code == 422

    async def test_create_relation_nonexistent_from_returns_404(
        self, client: AsyncClient
    ) -> None:
        """Creating a relation from nonexistent node should return 404."""
        asset = await client.post(
            "/api/v1/assets",
            json={"type": "dataset", "name": "Test"},
        )

        payload = {
            "from_uid": "nonexistent-uid",
            "to_uid": asset.json()["uid"],
            "type": "owns",
        }

        response = await client.post("/api/v1/relations", json=payload)

        assert response.status_code == 404


class TestListRelations:
    """Tests for GET /api/v1/relations."""

    async def test_list_empty_returns_empty_list(self, client: AsyncClient) -> None:
        """Listing relations when none exist should return empty list."""
        response = await client.get("/api/v1/relations")

        assert response.status_code == 200
        assert response.json()["items"] == []
        assert response.json()["total"] == 0

    async def test_list_returns_created_relations(self, client: AsyncClient) -> None:
        """Listing relations should return all created relations."""
        # Create nodes
        actor = await client.post(
            "/api/v1/actors",
            json={"type": "person", "name": "Alice"},
        )
        asset1 = await client.post(
            "/api/v1/assets",
            json={"type": "dataset", "name": "Data 1"},
        )
        asset2 = await client.post(
            "/api/v1/assets",
            json={"type": "report", "name": "Report 1"},
        )

        # Create relations
        await client.post(
            "/api/v1/relations",
            json={
                "from_uid": actor.json()["uid"],
                "to_uid": asset1.json()["uid"],
                "type": "owns",
            },
        )
        await client.post(
            "/api/v1/relations",
            json={
                "from_uid": asset1.json()["uid"],
                "to_uid": asset2.json()["uid"],
                "type": "feeds",
            },
        )

        response = await client.get("/api/v1/relations")

        assert response.status_code == 200
        assert response.json()["total"] == 2

    async def test_list_filter_by_type(self, client: AsyncClient) -> None:
        """Listing relations can filter by type."""
        actor = await client.post(
            "/api/v1/actors",
            json={"type": "person", "name": "Alice"},
        )
        asset = await client.post(
            "/api/v1/assets",
            json={"type": "dataset", "name": "Data"},
        )

        await client.post(
            "/api/v1/relations",
            json={
                "from_uid": actor.json()["uid"],
                "to_uid": asset.json()["uid"],
                "type": "owns",
            },
        )
        await client.post(
            "/api/v1/relations",
            json={
                "from_uid": actor.json()["uid"],
                "to_uid": asset.json()["uid"],
                "type": "uses",
            },
        )

        response = await client.get("/api/v1/relations?type=owns")

        assert response.status_code == 200
        assert response.json()["total"] == 1
        assert response.json()["items"][0]["type"] == "owns"

    async def test_list_filter_by_from_uid(self, client: AsyncClient) -> None:
        """Listing relations can filter by from_uid."""
        actor1 = await client.post(
            "/api/v1/actors",
            json={"type": "person", "name": "Alice"},
        )
        actor2 = await client.post(
            "/api/v1/actors",
            json={"type": "person", "name": "Bob"},
        )
        asset = await client.post(
            "/api/v1/assets",
            json={"type": "dataset", "name": "Data"},
        )

        await client.post(
            "/api/v1/relations",
            json={
                "from_uid": actor1.json()["uid"],
                "to_uid": asset.json()["uid"],
                "type": "owns",
            },
        )
        await client.post(
            "/api/v1/relations",
            json={
                "from_uid": actor2.json()["uid"],
                "to_uid": asset.json()["uid"],
                "type": "uses",
            },
        )

        response = await client.get(f"/api/v1/relations?from_uid={actor1.json()['uid']}")

        assert response.status_code == 200
        assert response.json()["total"] == 1


class TestDeleteRelation:
    """Tests for DELETE /api/v1/relations/{uid}."""

    async def test_delete_relation_returns_204(self, client: AsyncClient) -> None:
        """Deleting a relation should return 204."""
        actor = await client.post(
            "/api/v1/actors",
            json={"type": "person", "name": "Alice"},
        )
        asset = await client.post(
            "/api/v1/assets",
            json={"type": "dataset", "name": "Data"},
        )
        relation = await client.post(
            "/api/v1/relations",
            json={
                "from_uid": actor.json()["uid"],
                "to_uid": asset.json()["uid"],
                "type": "owns",
            },
        )

        response = await client.delete(f"/api/v1/relations/{relation.json()['uid']}")

        assert response.status_code == 204

        # Verify it's gone
        list_response = await client.get("/api/v1/relations")
        assert list_response.json()["total"] == 0

    async def test_delete_nonexistent_relation_returns_404(
        self, client: AsyncClient
    ) -> None:
        """Deleting a non-existent relation should return 404."""
        response = await client.delete("/api/v1/relations/nonexistent-uid")

        assert response.status_code == 404
