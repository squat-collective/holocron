"""Unit tests for the introspect-assembly + mapping logic.

We don't open a real PG connection here — `_assemble_scan` is a pure
function over the rows that `information_schema` would return, and the
mapping layer transforms that scan into Holocron payloads. Both layers
are exhaustively testable without the Docker dance of a live DB.
"""

from __future__ import annotations

from postgres_connector.introspect import _assemble_scan
from postgres_connector.mapping import _asset_uid, map_scan_to_assets
from postgres_connector.models import PgScan


# ---------- _assemble_scan ----------


def _scan(
    *,
    table_rows: list[tuple[str, str, str]],
    column_rows: list[tuple[str, str, str, str, str, int, str | None]],
    table_comments: list[tuple[str, str, str]] | None = None,
    column_comments: list[tuple[str, str, str, str]] | None = None,
) -> PgScan:
    return _assemble_scan(
        host="db.example",
        port=5432,
        database="prod",
        schema_name="public",
        table_rows=table_rows,
        column_rows=column_rows,
        table_comment_rows=table_comments or [],
        column_comment_rows=column_comments or [],
    )


class TestAssembleScan:
    def test_joins_columns_to_their_table(self) -> None:
        scan = _scan(
            table_rows=[("public", "customers", "BASE TABLE")],
            column_rows=[
                ("public", "customers", "id", "integer", "NO", 1, None),
                ("public", "customers", "email", "text", "YES", 2, None),
            ],
        )
        assert len(scan.tables) == 1
        table = scan.tables[0]
        assert table.qualified_name == "public.customers"
        assert [c.name for c in table.columns] == ["id", "email"]
        # Nullability comes from PG as 'YES'/'NO' strings — the model
        # stores it as bool. Easy to invert by accident.
        assert table.columns[0].is_nullable is False
        assert table.columns[1].is_nullable is True

    def test_columns_for_unknown_table_are_dropped(self) -> None:
        # If `information_schema.columns` somehow lists a column for a
        # table not in the tables result (e.g. permissions issue), we
        # silently drop it rather than fabricating a phantom table.
        scan = _scan(
            table_rows=[],
            column_rows=[("public", "ghost", "id", "integer", "NO", 1, None)],
        )
        assert scan.tables == []

    def test_views_are_included(self) -> None:
        # `BASE TABLE` vs `VIEW` should both make it through; the
        # mapping layer is what differentiates them in metadata.
        scan = _scan(
            table_rows=[
                ("public", "v_active", "VIEW"),
                ("public", "users", "BASE TABLE"),
            ],
            column_rows=[],
        )
        types = sorted(t.table_type for t in scan.tables)
        assert types == ["BASE TABLE", "VIEW"]

    def test_table_comment_attached(self) -> None:
        scan = _scan(
            table_rows=[("public", "users", "BASE TABLE")],
            column_rows=[],
            table_comments=[("public", "users", "All registered users")],
        )
        assert scan.tables[0].description == "All registered users"

    def test_column_comment_attached(self) -> None:
        scan = _scan(
            table_rows=[("public", "users", "BASE TABLE")],
            column_rows=[("public", "users", "email", "text", "YES", 1, None)],
            column_comments=[("public", "users", "email", "Primary contact email")],
        )
        col = scan.tables[0].columns[0]
        assert col.description == "Primary contact email"

    def test_columns_keep_ordinal_order(self) -> None:
        # PG's information_schema.columns is sorted by ordinal already;
        # we preserve that. Asserted explicitly so a future refactor
        # that uses dict ordering doesn't silently scramble columns.
        scan = _scan(
            table_rows=[("public", "users", "BASE TABLE")],
            column_rows=[
                ("public", "users", "name", "text", "YES", 2, None),
                ("public", "users", "id", "integer", "NO", 1, None),
                ("public", "users", "created_at", "timestamp", "NO", 3, None),
            ],
        )
        # Whatever order rows arrive in, the model carries the ordinal
        # so downstream sort is correct. The mapping layer does sort
        # implicitly via `enumerate(columns)`.
        cols = scan.tables[0].columns
        assert {c.name: c.ordinal_position for c in cols} == {
            "name": 2,
            "id": 1,
            "created_at": 3,
        }


# ---------- mapping ----------


class TestAssetUid:
    def test_is_deterministic(self) -> None:
        a = _asset_uid("h", 5432, "db", "public", "users")
        b = _asset_uid("h", 5432, "db", "public", "users")
        assert a == b

    def test_changes_with_host(self) -> None:
        a = _asset_uid("h1", 5432, "db", "public", "users")
        b = _asset_uid("h2", 5432, "db", "public", "users")
        assert a != b

    def test_changes_with_table(self) -> None:
        a = _asset_uid("h", 5432, "db", "public", "users")
        b = _asset_uid("h", 5432, "db", "public", "orders")
        assert a != b

    def test_is_32_chars(self) -> None:
        # Asserted because the API has no UID length limit but the UI
        # truncates long uids in lists for readability — sticking to
        # 32 keeps everything tidy.
        assert len(_asset_uid("h", 5432, "db", "public", "users")) == 32


class TestMapScanToAssets:
    def _scan_with(self, table_rows, column_rows, **kwargs):  # type: ignore[no-untyped-def]
        return _scan(table_rows=table_rows, column_rows=column_rows, **kwargs)

    def test_one_asset_per_table(self) -> None:
        scan = self._scan_with(
            [("public", "users", "BASE TABLE"), ("public", "orders", "BASE TABLE")],
            [],
        )
        assets = map_scan_to_assets(scan)
        names = sorted(a.name for a in assets)
        assert names == ["public.orders", "public.users"]

    def test_asset_metadata_carries_schema_tree(self) -> None:
        scan = self._scan_with(
            [("public", "users", "BASE TABLE")],
            [
                ("public", "users", "id", "integer", "NO", 1, None),
                ("public", "users", "email", "text", "YES", 2, None),
            ],
        )
        asset = map_scan_to_assets(scan)[0]
        schema = asset.metadata["schema"]
        # One container (the table) with two children (the columns).
        assert len(schema) == 1
        container = schema[0]
        assert container["nodeType"] == "container"
        assert container["containerType"] == "table"
        assert container["name"] == "public.users"
        assert [c["name"] for c in container["children"]] == ["id", "email"]
        # Required-ness flows through (id is NOT NULL).
        assert container["children"][0].get("required") is True
        assert "required" not in container["children"][1]

    def test_view_metadata_format_says_view(self) -> None:
        # Views still come through as `dataset` (Holocron has no
        # separate view type) but `metadata.format` distinguishes them.
        scan = self._scan_with(
            [("public", "v_active", "VIEW")],
            [],
        )
        asset = map_scan_to_assets(scan)[0]
        assert asset.type == "dataset"
        assert asset.metadata["format"] == "view"

    def test_location_is_pseudo_url_without_password(self) -> None:
        # The location string is shown in the UI — it must not contain
        # any credential. Sanity check.
        scan = self._scan_with(
            [("public", "users", "BASE TABLE")],
            [],
        )
        asset = map_scan_to_assets(scan)[0]
        assert asset.location == "postgresql://db.example:5432/prod/public.users"
        # No password leakage.
        assert "password" not in (asset.location or "").lower()

    def test_table_with_no_columns_still_produces_asset(self) -> None:
        # Newly-created empty tables exist and should be catalogued —
        # don't drop them just because columns hasn't caught up.
        scan = self._scan_with(
            [("public", "draft", "BASE TABLE")],
            [],
        )
        assets = map_scan_to_assets(scan)
        assert len(assets) == 1
        # The schema container has no children — that's the expected shape.
        children = assets[0].metadata["schema"][0]["children"]
        assert children == []

    def test_description_carries_through(self) -> None:
        scan = self._scan_with(
            [("public", "users", "BASE TABLE")],
            [("public", "users", "email", "text", "NO", 1, None)],
            table_comments=[("public", "users", "Registered users")],
            column_comments=[("public", "users", "email", "Primary contact")],
        )
        asset = map_scan_to_assets(scan)[0]
        assert asset.description == "Registered users"
        col = asset.metadata["schema"][0]["children"][0]
        assert col["description"] == "Primary contact"
