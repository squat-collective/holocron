"""Excel exporter — write the Holocron catalog as a single .xlsx workbook."""

from excel_exporter.client import HolocronReadClient
from excel_exporter.models import CatalogSnapshot
from excel_exporter.workbook import write_workbook

__version__ = "0.1.0"


def export_catalog(
    api_url: str,
    output_path: str,
    *,
    token: str | None = None,
) -> CatalogSnapshot:
    """Fetch the catalog from a running API and write it to an .xlsx file.

    Returns the snapshot so callers can inspect counts.
    """
    with HolocronReadClient(api_url, token=token) as client:
        snapshot = client.fetch_snapshot()
    write_workbook(snapshot, output_path)
    return snapshot


__all__ = [
    "CatalogSnapshot",
    "HolocronReadClient",
    "export_catalog",
    "write_workbook",
]
