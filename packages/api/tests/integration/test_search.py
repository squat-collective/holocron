"""Integration tests for the cross-entity /search endpoint."""

from httpx import AsyncClient


async def _seed_asset(
    client: AsyncClient,
    *,
    name: str,
    description: str | None = None,
    type: str = "dataset",
    metadata: dict | None = None,
) -> str:
    """Create an asset, return its uid."""
    payload: dict = {"type": type, "name": name}
    if description is not None:
        payload["description"] = description
    if metadata is not None:
        payload["metadata"] = metadata
    response = await client.post("/api/v1/assets", json=payload)
    assert response.status_code == 201, response.text
    return response.json()["uid"]


async def _seed_actor(
    client: AsyncClient,
    *,
    name: str,
    type: str = "person",
    email: str | None = None,
    description: str | None = None,
) -> str:
    payload: dict = {"type": type, "name": name}
    if email is not None:
        payload["email"] = email
    if description is not None:
        payload["description"] = description
    response = await client.post("/api/v1/actors", json=payload)
    assert response.status_code == 201, response.text
    return response.json()["uid"]


async def _seed_rule(
    client: AsyncClient,
    *,
    name: str,
    description: str,
    severity: str = "warning",
    category: str | None = None,
) -> str:
    payload: dict = {
        "name": name,
        "description": description,
        "severity": severity,
    }
    if category is not None:
        payload["category"] = category
    response = await client.post("/api/v1/rules", json=payload)
    assert response.status_code == 201, response.text
    return response.json()["uid"]


class TestSearchEndpoint:
    """GET /api/v1/search returns a discriminated list of matches."""

    async def test_empty_query_returns_empty_list(self, client: AsyncClient) -> None:
        await _seed_asset(client, name="Sales Data")

        response = await client.get("/api/v1/search", params={"q": ""})

        assert response.status_code == 200
        data = response.json()
        assert data == {"items": [], "total": 0}

    async def test_matches_asset_by_name(self, client: AsyncClient) -> None:
        asset_uid = await _seed_asset(client, name="Customer Orders")
        await _seed_asset(client, name="Invoices")

        response = await client.get("/api/v1/search", params={"q": "customer"})

        assert response.status_code == 200
        items = response.json()["items"]
        asset_hits = [i for i in items if i["kind"] == "asset"]
        assert len(asset_hits) == 1
        assert asset_hits[0]["uid"] == asset_uid
        assert asset_hits[0]["name"] == "Customer Orders"

    async def test_matches_asset_by_description(self, client: AsyncClient) -> None:
        asset_uid = await _seed_asset(
            client,
            name="Z109",
            description="Daily revenue from North Europe warehouses",
        )

        response = await client.get("/api/v1/search", params={"q": "revenue"})

        items = response.json()["items"]
        asset_hits = [i for i in items if i["kind"] == "asset"]
        assert any(h["uid"] == asset_uid for h in asset_hits)

    async def test_matches_actor_by_name_and_email(self, client: AsyncClient) -> None:
        person_uid = await _seed_actor(
            client,
            name="Alice Analyst",
            email="alice@acme.io",
        )
        await _seed_actor(client, name="Bob Builder")

        by_name = await client.get("/api/v1/search", params={"q": "alice"})
        by_email = await client.get("/api/v1/search", params={"q": "acme"})

        assert any(
            i["kind"] == "actor" and i["uid"] == person_uid
            for i in by_name.json()["items"]
        )
        assert any(
            i["kind"] == "actor" and i["uid"] == person_uid
            for i in by_email.json()["items"]
        )

    async def test_matches_rule_by_name_and_category(self, client: AsyncClient) -> None:
        rule_uid = await _seed_rule(
            client,
            name="Prices must be positive",
            description="No row where price <= 0",
            category="billing",
        )

        response = await client.get("/api/v1/search", params={"q": "billing"})

        items = response.json()["items"]
        assert any(
            i["kind"] == "rule" and i["uid"] == rule_uid for i in items
        )

    async def test_surfaces_schema_container_hits(self, client: AsyncClient) -> None:
        asset_uid = await _seed_asset(
            client,
            name="Warehouse",
            metadata={
                "schema": [
                    {
                        "id": "root",
                        "name": "Customers",
                        "nodeType": "container",
                        "containerType": "table",
                        "children": [
                            {
                                "id": "c1",
                                "name": "Addresses",
                                "nodeType": "container",
                                "containerType": "section",
                                "children": [],
                            },
                        ],
                    },
                ],
            },
        )

        response = await client.get("/api/v1/search", params={"q": "addresses"})

        items = response.json()["items"]
        container_hits = [i for i in items if i["kind"] == "container"]
        assert len(container_hits) >= 1
        hit = next(h for h in container_hits if h["name"] == "Addresses")
        assert hit["asset_uid"] == asset_uid
        assert hit["path"].endswith("Addresses")
        assert hit["container_type"] == "section"

    async def test_surfaces_schema_field_hits(self, client: AsyncClient) -> None:
        asset_uid = await _seed_asset(
            client,
            name="Warehouse",
            metadata={
                "schema": [
                    {
                        "id": "root",
                        "name": "Customers",
                        "nodeType": "container",
                        "containerType": "table",
                        "children": [
                            {
                                "id": "f1",
                                "name": "email",
                                "nodeType": "field",
                                "dataType": "string",
                                "pii": True,
                            },
                        ],
                    },
                ],
            },
        )

        response = await client.get("/api/v1/search", params={"q": "email"})

        items = response.json()["items"]
        field_hits = [i for i in items if i["kind"] == "field"]
        assert any(
            h["name"] == "email"
            and h["asset_uid"] == asset_uid
            and h["data_type"] == "string"
            and h["pii"] is True
            for h in field_hits
        )

    async def test_respects_limit(self, client: AsyncClient) -> None:
        for i in range(15):
            await _seed_asset(client, name=f"report-{i}", type="report")

        response = await client.get(
            "/api/v1/search",
            params={"q": "report", "limit": 5},
        )

        assert response.status_code == 200
        assert len(response.json()["items"]) <= 5

    async def test_case_insensitive(self, client: AsyncClient) -> None:
        asset_uid = await _seed_asset(client, name="SALES_PROD")

        response = await client.get("/api/v1/search", params={"q": "sales"})

        items = response.json()["items"]
        assert any(
            i["kind"] == "asset" and i["uid"] == asset_uid for i in items
        )
