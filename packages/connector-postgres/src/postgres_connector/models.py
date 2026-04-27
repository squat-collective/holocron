"""Internal models for what we read from PG and what we push to Holocron.

Two shape families:

  - **Pg* models** mirror the rows we get from `information_schema` —
    intentionally close to the wire format so the introspection layer
    stays a thin SQL-to-pydantic translator.
  - **AssetPayload** is what the mapping layer produces and the plugin
    upserts. Same shape pattern as csv-connector, kept independent so
    connectors can evolve without coordinating.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class PgColumn(BaseModel):
    """One row of `information_schema.columns`."""

    name: str
    data_type: str
    is_nullable: bool
    ordinal_position: int
    column_default: str | None = None
    description: str | None = None


class PgTable(BaseModel):
    """One table or view from `information_schema.tables` + the columns
    we joined for it.

    `schema_name` rather than `schema` — Pydantic's `BaseModel.schema()`
    is deprecated-but-still-present, and using `schema` as a field name
    triggers a shadow warning. The rename is local to this connector;
    we never expose this model on the wire.
    """

    schema_name: str
    name: str
    table_type: str  # "BASE TABLE" | "VIEW" | …
    columns: list[PgColumn] = Field(default_factory=list)
    description: str | None = None

    @property
    def qualified_name(self) -> str:
        return f"{self.schema_name}.{self.name}"


class PgScan(BaseModel):
    """The result of introspecting a PG instance."""

    host: str
    port: int
    database: str
    schema_name: str
    tables: list[PgTable] = Field(default_factory=list)


class AssetPayload(BaseModel):
    """Holocron asset payload produced by the mapping layer."""

    uid: str
    type: str  # always "dataset" for now
    name: str
    description: str | None
    location: str | None
    metadata: dict[str, Any] = Field(default_factory=dict)
