"""Pass-through extraction of raw workbook metadata."""

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from openpyxl.workbook.workbook import Workbook


def _stringify(v: Any) -> Any:
    """Make non-serializable types JSON-friendly."""
    if v is None or isinstance(v, str | int | float | bool):
        return v
    return str(v)


def extract_metadata(wb: "Workbook") -> dict[str, Any]:
    """Extract core/app/custom properties as a flat dict for the workbook asset."""
    metadata: dict[str, Any] = {}
    props = wb.properties

    # Core properties (Title, Subject, Creator, etc.)
    for attr in (
        "title",
        "subject",
        "description",
        "keywords",
        "category",
        "creator",
        "lastModifiedBy",
        "created",
        "modified",
        "last_printed",
        "revision",
        "version",
        "language",
    ):
        value = getattr(props, attr, None)
        if value:
            metadata[f"core.{attr}"] = _stringify(value)

    # Custom properties
    custom = getattr(wb, "custom_doc_props", None)
    if custom is not None:
        try:
            for prop in custom.props:
                metadata[f"custom.{prop.name}"] = _stringify(prop.value)
        except (AttributeError, TypeError):
            pass

    return metadata
