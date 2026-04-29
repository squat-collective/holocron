"""Integration tests for the Business Glossary (Term) API."""

from httpx import AsyncClient


class TestCreateTerm:
    """Tests for POST /api/v1/terms."""

    async def test_create_term_returns_201(self, client: AsyncClient) -> None:
        payload = {
            "name": "Active Customer",
            "definition": "A customer that has placed at least one order in the past 90 days.",
            "domain": "Sales",
        }
        response = await client.post("/api/v1/terms", json=payload)

        assert response.status_code == 201
        body = response.json()
        assert body["name"] == "Active Customer"
        assert body["definition"].startswith("A customer that has placed")
        assert body["domain"] == "Sales"
        assert body["status"] == "draft"
        assert body["pii"] is False
        assert "uid" in body

    async def test_create_term_with_full_payload(self, client: AsyncClient) -> None:
        """Optional fields (formula, unit, pii, status) are persisted."""
        payload = {
            "name": "Revenue",
            "definition": "Sum of order amounts after discounts and refunds.",
            "domain": "Finance",
            "status": "approved",
            "formula": "SUM(orders.amount) - SUM(refunds.amount)",
            "unit": "USD",
            "pii": False,
        }
        response = await client.post("/api/v1/terms", json=payload)
        assert response.status_code == 201
        body = response.json()
        assert body["formula"] == payload["formula"]
        assert body["unit"] == "USD"
        assert body["status"] == "approved"

    async def test_create_term_without_definition_returns_422(self, client: AsyncClient) -> None:
        response = await client.post("/api/v1/terms", json={"name": "No Definition"})
        assert response.status_code == 422

    async def test_create_term_with_invalid_status_returns_422(self, client: AsyncClient) -> None:
        response = await client.post(
            "/api/v1/terms",
            json={"name": "Bad", "definition": "x", "status": "🤷"},
        )
        assert response.status_code == 422


class TestGetTerm:
    """Tests for GET /api/v1/terms/{uid}."""

    async def test_get_term_returns_200(self, client: AsyncClient) -> None:
        create = await client.post(
            "/api/v1/terms",
            json={"name": "Churn", "definition": "Customer attrition rate over a period."},
        )
        uid = create.json()["uid"]

        response = await client.get(f"/api/v1/terms/{uid}")
        assert response.status_code == 200
        assert response.json()["uid"] == uid
        assert response.json()["name"] == "Churn"

    async def test_get_unknown_returns_404(self, client: AsyncClient) -> None:
        response = await client.get("/api/v1/terms/missing")
        assert response.status_code == 404


class TestListTerms:
    """Tests for GET /api/v1/terms (filters)."""

    async def test_list_filters_by_domain(self, client: AsyncClient) -> None:
        await client.post(
            "/api/v1/terms",
            json={"name": "Revenue", "definition": "x", "domain": "Finance"},
        )
        await client.post(
            "/api/v1/terms",
            json={"name": "Churn", "definition": "x", "domain": "Sales"},
        )

        response = await client.get("/api/v1/terms?domain=Finance")

        assert response.status_code == 200
        body = response.json()
        assert body["total"] == 1
        assert body["items"][0]["name"] == "Revenue"

    async def test_list_filters_by_status(self, client: AsyncClient) -> None:
        await client.post(
            "/api/v1/terms",
            json={"name": "Approved Term", "definition": "x", "status": "approved"},
        )
        await client.post(
            "/api/v1/terms",
            json={"name": "Draft Term", "definition": "x"},
        )

        response = await client.get("/api/v1/terms?status=approved")
        body = response.json()
        assert body["total"] == 1
        assert body["items"][0]["name"] == "Approved Term"

    async def test_list_filters_by_pii(self, client: AsyncClient) -> None:
        await client.post(
            "/api/v1/terms",
            json={"name": "Email", "definition": "x", "pii": True},
        )
        await client.post(
            "/api/v1/terms",
            json={"name": "OrderID", "definition": "x", "pii": False},
        )
        response = await client.get("/api/v1/terms?pii=true")
        body = response.json()
        assert body["total"] == 1
        assert body["items"][0]["name"] == "Email"


class TestUpdateTerm:
    async def test_update_changes_persist(self, client: AsyncClient) -> None:
        create = await client.post(
            "/api/v1/terms", json={"name": "Tmp", "definition": "x"}
        )
        uid = create.json()["uid"]
        response = await client.put(
            f"/api/v1/terms/{uid}",
            json={"name": "Renamed", "status": "approved"},
        )
        assert response.status_code == 200
        assert response.json()["name"] == "Renamed"
        assert response.json()["status"] == "approved"

    async def test_update_unknown_returns_404(self, client: AsyncClient) -> None:
        response = await client.put("/api/v1/terms/missing", json={"name": "x"})
        assert response.status_code == 404


class TestDeleteTerm:
    async def test_delete_returns_204(self, client: AsyncClient) -> None:
        create = await client.post(
            "/api/v1/terms", json={"name": "Doomed", "definition": "x"}
        )
        uid = create.json()["uid"]
        response = await client.delete(f"/api/v1/terms/{uid}")
        assert response.status_code == 204
        get = await client.get(f"/api/v1/terms/{uid}")
        assert get.status_code == 404

    async def test_delete_unknown_returns_404(self, client: AsyncClient) -> None:
        response = await client.delete("/api/v1/terms/missing")
        assert response.status_code == 404


class TestTermDefinesAsset:
    """Tests for the DEFINES wiring between term and asset."""

    async def test_define_then_list_defined_assets(self, client: AsyncClient) -> None:
        term_resp = await client.post(
            "/api/v1/terms", json={"name": "Revenue", "definition": "x"}
        )
        term_uid = term_resp.json()["uid"]
        asset_resp = await client.post(
            "/api/v1/assets",
            json={"type": "dataset", "name": "Sales Summary"},
        )
        asset_uid = asset_resp.json()["uid"]

        # Wire the DEFINES edge.
        link = await client.post(
            f"/api/v1/terms/{term_uid}/defines/{asset_uid}",
        )
        assert link.status_code == 204

        # The defined-assets endpoint surfaces it back.
        listing = await client.get(f"/api/v1/terms/{term_uid}/defines")
        assert listing.status_code == 200
        body = listing.json()
        assert body["term_uid"] == term_uid
        assert len(body["items"]) == 1
        assert body["items"][0]["uid"] == asset_uid
        assert body["items"][0]["name"] == "Sales Summary"
        assert body["items"][0]["type"] == "dataset"

    async def test_define_unknown_term_returns_404(self, client: AsyncClient) -> None:
        asset_resp = await client.post(
            "/api/v1/assets", json={"type": "dataset", "name": "Asset"}
        )
        asset_uid = asset_resp.json()["uid"]
        response = await client.post(
            f"/api/v1/terms/missing-term/defines/{asset_uid}",
        )
        assert response.status_code == 404

    async def test_define_unknown_asset_returns_404(self, client: AsyncClient) -> None:
        term_resp = await client.post(
            "/api/v1/terms", json={"name": "T", "definition": "x"}
        )
        term_uid = term_resp.json()["uid"]
        response = await client.post(
            f"/api/v1/terms/{term_uid}/defines/no-such-asset",
        )
        assert response.status_code == 404

    async def test_undefine_removes_edge(self, client: AsyncClient) -> None:
        term_resp = await client.post(
            "/api/v1/terms", json={"name": "T", "definition": "x"}
        )
        term_uid = term_resp.json()["uid"]
        asset_resp = await client.post(
            "/api/v1/assets", json={"type": "dataset", "name": "A"}
        )
        asset_uid = asset_resp.json()["uid"]
        await client.post(f"/api/v1/terms/{term_uid}/defines/{asset_uid}")

        un = await client.delete(f"/api/v1/terms/{term_uid}/defines/{asset_uid}")
        assert un.status_code == 204

        listing = await client.get(f"/api/v1/terms/{term_uid}/defines")
        assert listing.json()["items"] == []

    async def test_undefine_no_edge_returns_404(self, client: AsyncClient) -> None:
        """Trying to remove an edge that never existed is a 404, not a silent 204."""
        term_resp = await client.post(
            "/api/v1/terms", json={"name": "T", "definition": "x"}
        )
        term_uid = term_resp.json()["uid"]
        asset_resp = await client.post(
            "/api/v1/assets", json={"type": "dataset", "name": "A"}
        )
        asset_uid = asset_resp.json()["uid"]

        un = await client.delete(f"/api/v1/terms/{term_uid}/defines/{asset_uid}")
        assert un.status_code == 404


class TestTermViaRelationsApi:
    """Sanity check — the new RelationTypes work through the generic relations API too."""

    async def test_create_defines_relation_via_relations_endpoint(
        self, client: AsyncClient
    ) -> None:
        term_resp = await client.post(
            "/api/v1/terms", json={"name": "T", "definition": "x"}
        )
        term_uid = term_resp.json()["uid"]
        asset_resp = await client.post(
            "/api/v1/assets", json={"type": "dataset", "name": "A"}
        )
        asset_uid = asset_resp.json()["uid"]

        rel = await client.post(
            "/api/v1/relations",
            json={"from_uid": term_uid, "to_uid": asset_uid, "type": "defines"},
        )
        assert rel.status_code == 201
        body = rel.json()
        assert body["type"] == "defines"
