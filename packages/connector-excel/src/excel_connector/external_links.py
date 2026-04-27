"""Detect external workbook references in a workbook."""

from typing import TYPE_CHECKING

from excel_connector.models import DetectedExternalLink

if TYPE_CHECKING:
    from openpyxl.workbook.workbook import Workbook


def detect_external_links(wb: "Workbook") -> list[DetectedExternalLink]:
    """Read `wb.external_links` and surface them as DetectedExternalLink.

    openpyxl's external_links collection contains ExternalLink objects with file_link.target.
    We surface the original target string — resolution to absolute paths is left to the caller.
    """
    detected: list[DetectedExternalLink] = []

    for link in getattr(wb, "_external_links", []) or []:
        target = getattr(getattr(link, "file_link", None), "target", None) or getattr(
            link, "Target", None
        )
        if not target:
            continue

        detected.append(
            DetectedExternalLink(
                target_path=str(target),
                referenced_from_sheets=[],  # populated by formulas.py during scan
            )
        )

    return detected
