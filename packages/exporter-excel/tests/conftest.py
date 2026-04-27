"""Shared fixtures for exporter tests."""

from datetime import UTC, datetime

import pytest

from excel_exporter.models import (
    ActorRecord,
    AssetRecord,
    CatalogSnapshot,
    RelationRecord,
)


@pytest.fixture
def snapshot() -> CatalogSnapshot:
    """A small but representative snapshot covering all tabs."""
    now = datetime(2026, 4, 19, 8, 0, tzinfo=UTC)

    customers = AssetRecord(
        uid="aaa1",
        type="dataset",
        name="customers.xlsx",
        description="Customer master file",
        location="/data/customers.xlsx",
        status="active",
        verified=False,
        discovered_by="excel-connector@0.1.0",
        metadata={
            "core.title": "Q4 Customers",
            "schema": [
                {
                    "id": "s1",
                    "name": "Customers",
                    "nodeType": "container",
                    "containerType": "sheet",
                    "children": [
                        {
                            "id": "t1",
                            "name": "Customers",
                            "nodeType": "container",
                            "containerType": "table",
                            "children": [
                                {
                                    "id": "f1",
                                    "name": "id",
                                    "nodeType": "field",
                                    "dataType": "integer",
                                },
                                {
                                    "id": "f2",
                                    "name": "email",
                                    "nodeType": "field",
                                    "dataType": "string",
                                    "pii": True,
                                },
                            ],
                        }
                    ],
                }
            ],
            "lineage_hints": [
                {
                    "from_sheet": "Customers",
                    "to_sheet": "Orders",
                    "to_table": "OrdersTable",
                    "to_cell": "C2",
                    "via_formula": "=VLOOKUP(B2, Customers!A:B, 2, FALSE)",
                    "is_lookup": True,
                }
            ],
        },
        created_at=now,
        updated_at=now,
    )

    manual_asset = AssetRecord(
        uid="aaa2",
        type="dataset",
        name="manual",
        location=None,
        status="active",
        verified=True,
        metadata={},
        created_at=now,
        updated_at=now,
    )

    actor = ActorRecord(
        uid="act1",
        type="person",
        name="Jean Dupont",
        email="jean@acme.com",
        verified=False,
        discovered_by="excel-connector@0.1.0",
        created_at=now,
        updated_at=now,
    )

    feeds_rel = RelationRecord(
        uid="r1",
        from_uid="aaa1",
        to_uid="aaa2",
        type="feeds",
        verified=False,
        properties={"via_formula": "=VLOOKUP(...)"},
        created_at=now,
    )

    owns_rel = RelationRecord(
        uid="r2",
        from_uid="act1",
        to_uid="aaa1",
        type="owns",
        verified=False,
        created_at=now,
    )

    return CatalogSnapshot(
        api_url="http://localhost:8100",
        fetched_at=now,
        assets=[customers, manual_asset],
        actors=[actor],
        relations=[feeds_rel, owns_rel],
    )
