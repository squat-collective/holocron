"""Integration tests for Actor API endpoints."""

from httpx import AsyncClient


class TestCreateActor:
    """Tests for POST /api/v1/actors."""

    async def test_create_person_returns_201(self, client: AsyncClient) -> None:
        """Creating a valid person should return 201."""
        payload = {
            "type": "person",
            "name": "Alice Smith",
            "email": "alice@example.com",
        }

        response = await client.post("/api/v1/actors", json=payload)

        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Alice Smith"
        assert data["type"] == "person"
        assert data["email"] == "alice@example.com"
        assert "uid" in data

    async def test_create_group_returns_201(self, client: AsyncClient) -> None:
        """Creating a valid group should return 201."""
        payload = {
            "type": "group",
            "name": "Data Team",
            "description": "The data engineering team",
        }

        response = await client.post("/api/v1/actors", json=payload)

        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Data Team"
        assert data["type"] == "group"
        assert data["description"] == "The data engineering team"

    async def test_create_actor_without_name_returns_422(
        self, client: AsyncClient
    ) -> None:
        """Creating an actor without name should return 422."""
        payload = {"type": "person", "email": "test@example.com"}

        response = await client.post("/api/v1/actors", json=payload)

        assert response.status_code == 422

    async def test_create_actor_with_invalid_type_returns_422(
        self, client: AsyncClient
    ) -> None:
        """Creating an actor with invalid type should return 422."""
        payload = {"type": "robot", "name": "R2D2"}

        response = await client.post("/api/v1/actors", json=payload)

        assert response.status_code == 422


class TestGetActor:
    """Tests for GET /api/v1/actors/{uid}."""

    async def test_get_existing_actor_returns_200(self, client: AsyncClient) -> None:
        """Getting an existing actor should return 200."""
        create_response = await client.post(
            "/api/v1/actors",
            json={"type": "person", "name": "Bob Jones"},
        )
        uid = create_response.json()["uid"]

        response = await client.get(f"/api/v1/actors/{uid}")

        assert response.status_code == 200
        assert response.json()["uid"] == uid
        assert response.json()["name"] == "Bob Jones"

    async def test_get_nonexistent_actor_returns_404(
        self, client: AsyncClient
    ) -> None:
        """Getting a non-existent actor should return 404."""
        response = await client.get("/api/v1/actors/nonexistent-uid")

        assert response.status_code == 404


class TestListActors:
    """Tests for GET /api/v1/actors."""

    async def test_list_empty_returns_empty_list(self, client: AsyncClient) -> None:
        """Listing actors when none exist should return empty list."""
        response = await client.get("/api/v1/actors")

        assert response.status_code == 200
        assert response.json()["items"] == []
        assert response.json()["total"] == 0

    async def test_list_returns_created_actors(self, client: AsyncClient) -> None:
        """Listing actors should return all created actors."""
        await client.post(
            "/api/v1/actors",
            json={"type": "person", "name": "Alice"},
        )
        await client.post(
            "/api/v1/actors",
            json={"type": "group", "name": "Team A"},
        )

        response = await client.get("/api/v1/actors")

        assert response.status_code == 200
        assert response.json()["total"] == 2
        assert len(response.json()["items"]) == 2

    async def test_list_filter_by_type(self, client: AsyncClient) -> None:
        """Listing actors can filter by type."""
        await client.post(
            "/api/v1/actors",
            json={"type": "person", "name": "Alice"},
        )
        await client.post(
            "/api/v1/actors",
            json={"type": "group", "name": "Team A"},
        )

        response = await client.get("/api/v1/actors?type=person")

        assert response.status_code == 200
        assert response.json()["total"] == 1
        assert response.json()["items"][0]["type"] == "person"


class TestUpdateActor:
    """Tests for PUT /api/v1/actors/{uid}."""

    async def test_update_actor_returns_200(self, client: AsyncClient) -> None:
        """Updating an actor should return 200 with updated data."""
        create_response = await client.post(
            "/api/v1/actors",
            json={"type": "person", "name": "Original Name"},
        )
        uid = create_response.json()["uid"]

        response = await client.put(
            f"/api/v1/actors/{uid}",
            json={"name": "Updated Name", "email": "new@example.com"},
        )

        assert response.status_code == 200
        assert response.json()["name"] == "Updated Name"
        assert response.json()["email"] == "new@example.com"

    async def test_update_nonexistent_actor_returns_404(
        self, client: AsyncClient
    ) -> None:
        """Updating a non-existent actor should return 404."""
        response = await client.put(
            "/api/v1/actors/nonexistent-uid",
            json={"name": "Updated"},
        )

        assert response.status_code == 404


class TestDeleteActor:
    """Tests for DELETE /api/v1/actors/{uid}."""

    async def test_delete_actor_returns_204(self, client: AsyncClient) -> None:
        """Deleting an actor should return 204."""
        create_response = await client.post(
            "/api/v1/actors",
            json={"type": "person", "name": "To Delete"},
        )
        uid = create_response.json()["uid"]

        response = await client.delete(f"/api/v1/actors/{uid}")

        assert response.status_code == 204

        # Verify it's gone
        get_response = await client.get(f"/api/v1/actors/{uid}")
        assert get_response.status_code == 404

    async def test_delete_nonexistent_actor_returns_404(
        self, client: AsyncClient
    ) -> None:
        """Deleting a non-existent actor should return 404."""
        response = await client.delete("/api/v1/actors/nonexistent-uid")

        assert response.status_code == 404
