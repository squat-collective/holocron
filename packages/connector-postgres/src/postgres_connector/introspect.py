"""Introspect a live PG connection into a `PgScan`.

The actual SQL is small: one query for `information_schema.tables`,
one for `information_schema.columns`, optionally one for object
descriptions. Joins happen in Python — keeps the SQL portable across PG
versions and lets the test suite hit `_assemble_scan` directly with
fake rows (no live DB required).
"""

from __future__ import annotations

import psycopg

from postgres_connector.models import PgColumn, PgScan, PgTable

# Tables list — restrict to the requested schema, exclude PG's internal
# `pg_catalog` and `information_schema` even if the user typed them
# explicitly (they're not catalog-worthy data assets).
_TABLES_SQL = """
    SELECT table_schema, table_name, table_type
    FROM information_schema.tables
    WHERE table_schema = %s
      AND table_schema NOT IN ('pg_catalog', 'information_schema')
    ORDER BY table_schema, table_name
"""

_COLUMNS_SQL = """
    SELECT
        table_schema,
        table_name,
        column_name,
        data_type,
        is_nullable,
        ordinal_position,
        column_default
    FROM information_schema.columns
    WHERE table_schema = %s
      AND table_schema NOT IN ('pg_catalog', 'information_schema')
    ORDER BY table_schema, table_name, ordinal_position
"""

# Comments live in pg_catalog. Joins by `(schema, table, ordinal)` for
# columns and `(schema, table)` for tables.
_TABLE_COMMENTS_SQL = """
    SELECT n.nspname, c.relname, d.description
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_description d ON d.objoid = c.oid AND d.objsubid = 0
    WHERE n.nspname = %s
      AND c.relkind IN ('r', 'v', 'm', 'p')  -- regular, view, matview, partitioned
      AND d.description IS NOT NULL
"""

_COLUMN_COMMENTS_SQL = """
    SELECT n.nspname, c.relname, a.attname, d.description
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
    JOIN pg_description d ON d.objoid = c.oid AND d.objsubid = a.attnum
    WHERE n.nspname = %s
"""


async def introspect(
    conn: psycopg.AsyncConnection,  # type: ignore[type-arg]
    *,
    host: str,
    port: int,
    database: str,
    schema: str,
) -> PgScan:
    """Run the introspection queries and assemble a `PgScan`.

    The connection is taken as-is — the caller owns its lifecycle. We
    query four small things and join them in Python.
    """
    async with conn.cursor() as cur:
        await cur.execute(_TABLES_SQL, (schema,))
        table_rows = await cur.fetchall()
        await cur.execute(_COLUMNS_SQL, (schema,))
        column_rows = await cur.fetchall()
        await cur.execute(_TABLE_COMMENTS_SQL, (schema,))
        table_comment_rows = await cur.fetchall()
        await cur.execute(_COLUMN_COMMENTS_SQL, (schema,))
        column_comment_rows = await cur.fetchall()

    return _assemble_scan(
        host=host,
        port=port,
        database=database,
        schema_name=schema,
        table_rows=list(table_rows),
        column_rows=list(column_rows),
        table_comment_rows=list(table_comment_rows),
        column_comment_rows=list(column_comment_rows),
    )


def _assemble_scan(
    *,
    host: str,
    port: int,
    database: str,
    schema_name: str,
    table_rows: list[tuple[str, str, str]],
    column_rows: list[tuple[str, str, str, str, str, int, str | None]],
    table_comment_rows: list[tuple[str, str, str]],
    column_comment_rows: list[tuple[str, str, str, str]],
) -> PgScan:
    """Pure assembly step — exposed so tests can build fake rows and
    exercise the join logic without a live PG.

    `table_rows`: (schema, name, table_type)
    `column_rows`: (schema, table, column, data_type, is_nullable, ordinal, default)
    `table_comment_rows`: (schema, table, description)
    `column_comment_rows`: (schema, table, column, description)
    """
    table_comments: dict[tuple[str, str], str] = {
        (s, t): desc for s, t, desc in table_comment_rows
    }
    column_comments: dict[tuple[str, str, str], str] = {
        (s, t, c): desc for s, t, c, desc in column_comment_rows
    }

    columns_by_table: dict[tuple[str, str], list[PgColumn]] = {}
    for s, t, name, data_type, is_nullable, ordinal, default in column_rows:
        col = PgColumn(
            name=name,
            data_type=data_type,
            is_nullable=is_nullable.upper() == "YES",
            ordinal_position=int(ordinal),
            column_default=default,
            description=column_comments.get((s, t, name)),
        )
        columns_by_table.setdefault((s, t), []).append(col)

    tables: list[PgTable] = []
    for s, t, table_type in table_rows:
        tables.append(
            PgTable(
                schema_name=s,
                name=t,
                table_type=table_type,
                columns=columns_by_table.get((s, t), []),
                description=table_comments.get((s, t)),
            )
        )

    return PgScan(
        host=host,
        port=port,
        database=database,
        schema_name=schema_name,
        tables=tables,
    )
