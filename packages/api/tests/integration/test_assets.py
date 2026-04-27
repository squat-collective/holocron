"""Integration tests for Asset API endpoints."""

from httpx import AsyncClient


class TestCreateAsset:
    """Tests for POST /api/v1/assets."""

    async def test_create_dataset_returns_201(self, client: AsyncClient) -> None:
        """Creating a valid dataset should return 201 with the created asset."""
        payload = {
            "type": "dataset",
            "name": "Sales Data",
            "description": "Monthly sales figures",
        }

        response = await client.post("/api/v1/assets", json=payload)

        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Sales Data"
        assert data["type"] == "dataset"
        assert data["description"] == "Monthly sales figures"
        assert "uid" in data
        assert data["status"] == "active"

    async def test_create_asset_without_name_returns_422(self, client: AsyncClient) -> None:
        """Creating an asset without name should return 422."""
        payload = {
            "type": "dataset",
            "description": "Missing name",
        }

        response = await client.post("/api/v1/assets", json=payload)

        assert response.status_code == 422

    async def test_create_asset_with_invalid_type_returns_422(self, client: AsyncClient) -> None:
        """Creating an asset with invalid type should return 422."""
        payload = {
            "type": "invalid_type",
            "name": "Test Asset",
        }

        response = await client.post("/api/v1/assets", json=payload)

        assert response.status_code == 422


class TestGetAsset:
    """Tests for GET /api/v1/assets/{uid}."""

    async def test_get_existing_asset_returns_200(self, client: AsyncClient) -> None:
        """Getting an existing asset should return 200."""
        # First create an asset
        create_response = await client.post(
            "/api/v1/assets",
            json={"type": "dataset", "name": "Test Data"},
        )
        uid = create_response.json()["uid"]

        # Then get it
        response = await client.get(f"/api/v1/assets/{uid}")

        assert response.status_code == 200
        assert response.json()["uid"] == uid
        assert response.json()["name"] == "Test Data"

    async def test_get_nonexistent_asset_returns_404(self, client: AsyncClient) -> None:
        """Getting a non-existent asset should return 404."""
        response = await client.get("/api/v1/assets/nonexistent-uid")

        assert response.status_code == 404


class TestListAssets:
    """Tests for GET /api/v1/assets."""

    async def test_list_empty_returns_empty_list(self, client: AsyncClient) -> None:
        """Listing assets when none exist should return empty list."""
        response = await client.get("/api/v1/assets")

        assert response.status_code == 200
        assert response.json()["items"] == []
        assert response.json()["total"] == 0

    async def test_list_returns_created_assets(self, client: AsyncClient) -> None:
        """Listing assets should return all created assets."""
        # Create two assets
        await client.post(
            "/api/v1/assets",
            json={"type": "dataset", "name": "Data 1"},
        )
        await client.post(
            "/api/v1/assets",
            json={"type": "report", "name": "Report 1"},
        )

        response = await client.get("/api/v1/assets")

        assert response.status_code == 200
        assert response.json()["total"] == 2
        assert len(response.json()["items"]) == 2

    async def test_list_filter_by_type(self, client: AsyncClient) -> None:
        """Listing assets can filter by type."""
        await client.post(
            "/api/v1/assets",
            json={"type": "dataset", "name": "Data 1"},
        )
        await client.post(
            "/api/v1/assets",
            json={"type": "report", "name": "Report 1"},
        )

        response = await client.get("/api/v1/assets?type=dataset")

        assert response.status_code == 200
        assert response.json()["total"] == 1
        assert response.json()["items"][0]["type"] == "dataset"

    async def test_list_filter_by_verified_false(self, client: AsyncClient) -> None:
        """Filtering by verified=false returns only unverified assets.

        Backs the "Find unverified" governance command — the palette uses
        this to surface assets that landed via a discovery plugin and need
        a human signoff.
        """
        # Create one verified, one unverified.
        await client.post("/api/v1/assets", json={"type": "dataset", "name": "Verified"})
        await client.post(
            "/api/v1/assets",
            json={"type": "dataset", "name": "Unverified", "verified": False},
        )

        response = await client.get("/api/v1/assets?verified=false")

        assert response.status_code == 200
        body = response.json()
        assert body["total"] == 1
        assert body["items"][0]["name"] == "Unverified"
        assert body["items"][0]["verified"] is False

    async def test_list_filter_by_verified_true(self, client: AsyncClient) -> None:
        """Filtering by verified=true returns only verified assets."""
        await client.post("/api/v1/assets", json={"type": "dataset", "name": "Verified"})
        await client.post(
            "/api/v1/assets",
            json={"type": "dataset", "name": "Unverified", "verified": False},
        )

        response = await client.get("/api/v1/assets?verified=true")

        assert response.status_code == 200
        body = response.json()
        assert body["total"] == 1
        assert body["items"][0]["name"] == "Verified"

    async def test_list_filter_has_description_false(self, client: AsyncClient) -> None:
        """Filtering by has_description=false surfaces undocumented assets.

        Empty string and missing description both count as undocumented —
        otherwise the filter would miss the common case where a user
        cleared the field through ⌘K.
        """
        await client.post(
            "/api/v1/assets",
            json={"type": "dataset", "name": "Documented", "description": "Has docs"},
        )
        await client.post(
            "/api/v1/assets",
            json={"type": "dataset", "name": "No description"},
        )
        await client.post(
            "/api/v1/assets",
            json={"type": "dataset", "name": "Empty description", "description": ""},
        )

        response = await client.get("/api/v1/assets?has_description=false")

        assert response.status_code == 200
        body = response.json()
        names = sorted(item["name"] for item in body["items"])
        assert body["total"] == 2
        assert names == ["Empty description", "No description"]

    async def test_list_filter_has_owner_false(self, client: AsyncClient) -> None:
        """Filtering by has_owner=false returns assets with no `owns` relation.

        Once a relation of type `owns` is created targeting the asset, the
        filter should exclude it.
        """
        # Two assets, only one will get an owner.
        owned_resp = await client.post(
            "/api/v1/assets",
            json={"type": "dataset", "name": "Owned"},
        )
        owned_uid = owned_resp.json()["uid"]
        await client.post(
            "/api/v1/assets",
            json={"type": "dataset", "name": "Orphan"},
        )

        # Create the owner actor + the relation.
        actor_resp = await client.post(
            "/api/v1/actors",
            json={"type": "person", "name": "Sam"},
        )
        actor_uid = actor_resp.json()["uid"]
        rel_resp = await client.post(
            "/api/v1/relations",
            json={"from_uid": actor_uid, "to_uid": owned_uid, "type": "owns"},
        )
        assert rel_resp.status_code == 201

        response = await client.get("/api/v1/assets?has_owner=false")

        assert response.status_code == 200
        body = response.json()
        assert body["total"] == 1
        assert body["items"][0]["name"] == "Orphan"

    async def test_list_filters_combine(self, client: AsyncClient) -> None:
        """Multiple filters AND together rather than overriding each other."""
        await client.post(
            "/api/v1/assets",
            json={"type": "dataset", "name": "Verified+Documented", "description": "ok"},
        )
        await client.post(
            "/api/v1/assets",
            json={"type": "dataset", "name": "Unverified+Documented", "verified": False, "description": "ok"},
        )
        await client.post(
            "/api/v1/assets",
            json={"type": "dataset", "name": "Unverified+Empty", "verified": False},
        )

        # Want unverified AND undocumented — only the third asset matches.
        response = await client.get(
            "/api/v1/assets?verified=false&has_description=false",
        )

        assert response.status_code == 200
        body = response.json()
        assert body["total"] == 1
        assert body["items"][0]["name"] == "Unverified+Empty"


class TestUpdateAsset:
    """Tests for PUT /api/v1/assets/{uid}."""

    async def test_update_asset_returns_200(self, client: AsyncClient) -> None:
        """Updating an asset should return 200 with updated data."""
        # Create asset
        create_response = await client.post(
            "/api/v1/assets",
            json={"type": "dataset", "name": "Original Name"},
        )
        uid = create_response.json()["uid"]

        # Update it
        response = await client.put(
            f"/api/v1/assets/{uid}",
            json={"name": "Updated Name", "description": "Now with description"},
        )

        assert response.status_code == 200
        assert response.json()["name"] == "Updated Name"
        assert response.json()["description"] == "Now with description"

    async def test_update_nonexistent_asset_returns_404(self, client: AsyncClient) -> None:
        """Updating a non-existent asset should return 404."""
        response = await client.put(
            "/api/v1/assets/nonexistent-uid",
            json={"name": "Updated"},
        )

        assert response.status_code == 404


class TestDeleteAsset:
    """Tests for DELETE /api/v1/assets/{uid}."""

    async def test_delete_asset_returns_204(self, client: AsyncClient) -> None:
        """Deleting an asset should return 204."""
        # Create asset
        create_response = await client.post(
            "/api/v1/assets",
            json={"type": "dataset", "name": "To Delete"},
        )
        uid = create_response.json()["uid"]

        # Delete it
        response = await client.delete(f"/api/v1/assets/{uid}")

        assert response.status_code == 204

        # Verify it's gone
        get_response = await client.get(f"/api/v1/assets/{uid}")
        assert get_response.status_code == 404

    async def test_delete_nonexistent_asset_returns_404(self, client: AsyncClient) -> None:
        """Deleting a non-existent asset should return 404."""
        response = await client.delete("/api/v1/assets/nonexistent-uid")

        assert response.status_code == 404
