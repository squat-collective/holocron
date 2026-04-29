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


class TestHierarchicalAssetTypes:
    """Tests for the hierarchical AssetType members.

    These cover the new schema/table/column, sheet/page/visual etc. types
    introduced for issue #2 (Hierarchical Assets).
    """

    async def test_create_column_asset_returns_201(self, client: AsyncClient) -> None:
        """`column` is a valid AssetType after the hierarchy extension."""
        response = await client.post(
            "/api/v1/assets",
            json={"type": "column", "name": "email", "metadata": {"data_type": "string", "pii": True}},
        )

        assert response.status_code == 201
        body = response.json()
        assert body["type"] == "column"
        assert body["metadata"]["pii"] is True

    async def test_list_filter_by_new_type(self, client: AsyncClient) -> None:
        """The list filter should accept the new hierarchical types."""
        await client.post("/api/v1/assets", json={"type": "table", "name": "orders"})
        await client.post("/api/v1/assets", json={"type": "column", "name": "order_id"})

        response = await client.get("/api/v1/assets?type=column")

        assert response.status_code == 200
        body = response.json()
        assert body["total"] == 1
        assert body["items"][0]["name"] == "order_id"


class TestAssetTree:
    """Tests for GET /api/v1/assets/{uid}/tree."""

    async def _create(self, client: AsyncClient, type_: str, name: str) -> str:
        resp = await client.post("/api/v1/assets", json={"type": type_, "name": name})
        assert resp.status_code == 201
        return resp.json()["uid"]

    async def _link(self, client: AsyncClient, parent: str, child: str) -> None:
        resp = await client.post(
            "/api/v1/relations",
            json={"from_uid": parent, "to_uid": child, "type": "contains"},
        )
        assert resp.status_code == 201

    async def test_tree_returns_root_with_no_children(self, client: AsyncClient) -> None:
        """A leaf asset returns itself with an empty children list."""
        uid = await self._create(client, "dataset", "lonely")

        response = await client.get(f"/api/v1/assets/{uid}/tree")

        assert response.status_code == 200
        body = response.json()
        assert body["asset"]["uid"] == uid
        assert body["children"] == []

    async def test_tree_walks_contains_one_level(self, client: AsyncClient) -> None:
        """Direct children appear under the root."""
        ds = await self._create(client, "dataset", "sales")
        col_a = await self._create(client, "column", "amount")
        col_b = await self._create(client, "column", "currency")
        await self._link(client, ds, col_a)
        await self._link(client, ds, col_b)

        response = await client.get(f"/api/v1/assets/{ds}/tree")

        assert response.status_code == 200
        body = response.json()
        names = sorted(c["asset"]["name"] for c in body["children"])
        assert names == ["amount", "currency"]
        for child in body["children"]:
            assert child["children"] == []

    async def test_tree_respects_depth(self, client: AsyncClient) -> None:
        """`depth=1` returns direct children only; `depth=2` returns grandchildren."""
        ds = await self._create(client, "dataset", "warehouse")
        table = await self._create(client, "table", "orders")
        col = await self._create(client, "column", "order_id")
        await self._link(client, ds, table)
        await self._link(client, table, col)

        # depth=1 — only the table; column should be absent.
        resp1 = await client.get(f"/api/v1/assets/{ds}/tree?depth=1")
        body1 = resp1.json()
        assert len(body1["children"]) == 1
        assert body1["children"][0]["asset"]["name"] == "orders"
        assert body1["children"][0]["children"] == []

        # depth=2 — table + column.
        resp2 = await client.get(f"/api/v1/assets/{ds}/tree?depth=2")
        body2 = resp2.json()
        assert body2["children"][0]["children"][0]["asset"]["name"] == "order_id"

    async def test_tree_excludes_schema_projection_nodes(self, client: AsyncClient) -> None:
        """Schema-projection :Container/:Field nodes must not leak into the tree.

        Setting `metadata.schema` on an asset materialises projection
        nodes via `[:CONTAINS]`. They share the relationship type with
        the new asset hierarchy, so the tree walker must filter them
        out by `child:Asset`.
        """
        ds = await self._create(client, "dataset", "with-schema")
        col = await self._create(client, "column", "email")
        await self._link(client, ds, col)

        # Add metadata.schema so the projection materialises projection nodes.
        update = await client.put(
            f"/api/v1/assets/{ds}",
            json={
                "metadata": {
                    "schema": [
                        {"nodeType": "field", "name": "ghost_col", "dataType": "string"},
                    ],
                }
            },
        )
        assert update.status_code == 200

        # The real column asset should still be the only thing returned.
        response = await client.get(f"/api/v1/assets/{ds}/tree")
        body = response.json()
        assert len(body["children"]) == 1
        assert body["children"][0]["asset"]["name"] == "email"

    async def test_tree_unknown_uid_returns_404(self, client: AsyncClient) -> None:
        response = await client.get("/api/v1/assets/does-not-exist/tree")
        assert response.status_code == 404


class TestBulkCreateSchema:
    """Tests for POST /api/v1/assets/{uid}/schema."""

    async def test_bulk_creates_nested_tree(self, client: AsyncClient) -> None:
        """A nested tree spec creates assets + contains relations in one call."""
        root = await client.post(
            "/api/v1/assets",
            json={"type": "dataset", "name": "warehouse"},
        )
        root_uid = root.json()["uid"]

        body = {
            "children": [
                {
                    "type": "table",
                    "name": "orders",
                    "children": [
                        {"type": "column", "name": "order_id", "metadata": {"data_type": "integer"}},
                        {"type": "column", "name": "amount", "metadata": {"data_type": "float"}},
                    ],
                }
            ]
        }
        response = await client.post(f"/api/v1/assets/{root_uid}/schema", json=body)

        assert response.status_code == 201
        tree = response.json()
        assert tree["asset"]["uid"] == root_uid
        assert len(tree["children"]) == 1
        table = tree["children"][0]
        assert table["asset"]["type"] == "table"
        col_names = sorted(c["asset"]["name"] for c in table["children"])
        assert col_names == ["amount", "order_id"]

        # The full tree is queryable afterwards.
        verify = await client.get(f"/api/v1/assets/{root_uid}/tree?depth=2")
        verify_tree = verify.json()
        assert verify_tree["children"][0]["asset"]["name"] == "orders"
        assert len(verify_tree["children"][0]["children"]) == 2

    async def test_bulk_unknown_parent_returns_404(self, client: AsyncClient) -> None:
        response = await client.post(
            "/api/v1/assets/missing/schema",
            json={"children": [{"type": "table", "name": "x"}]},
        )
        assert response.status_code == 404
