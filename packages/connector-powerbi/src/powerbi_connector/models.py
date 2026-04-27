"""Internal models for what we extract from a .pbix and what we push to
Holocron.

Two shape families:

  - **PbixScan** — what `extract` + `parse` produce. Pure data: no I/O,
    no opinions about Holocron's schema. Easy to feed test fixtures.
  - **AssetPayload / RelationPayload** — what the mapping layer produces
    and the plugin upserts. Mirrors the shapes csv-connector and
    postgres-connector use, kept independent so each plugin evolves on
    its own clock.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class PbixTableRef(BaseModel):
    """A distinct (table, columns) reference extracted from the report's
    visual layout. Columns is a sorted list so equal sets compare
    equal."""

    name: str
    columns: list[str] = Field(default_factory=list)


class PbixScan(BaseModel):
    """The result of opening + parsing a .pbix file."""

    file_name: str
    layout_present: bool = False
    layout_version: int | None = None
    page_count: int = 0
    visual_count: int = 0
    tables: list[PbixTableRef] = Field(default_factory=list)
    # Raw artefact inventory — names of the parts found inside the zip.
    # Useful for debugging when a future PBIX format change breaks
    # parsing; the inventory is always populated even if structured
    # extraction fails.
    artefacts: list[str] = Field(default_factory=list)


class AssetPayload(BaseModel):
    """Holocron asset payload produced by the mapping layer."""

    uid: str
    type: str  # "report" for the .pbix; "dataset" for each referenced table
    name: str
    description: str | None = None
    location: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class RelationPayload(BaseModel):
    """Holocron relation payload — `uses` edges from report → tables."""

    uid: str
    from_uid: str
    to_uid: str
    type: str  # always "uses" for now
    properties: dict[str, Any] = Field(default_factory=dict)
