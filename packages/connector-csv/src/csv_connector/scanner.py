"""Top-level scan entry point — orchestrates encoding, dialect, header, and type detection."""

from __future__ import annotations

import csv
from pathlib import Path

from csv_connector.actors import extract_actors
from csv_connector.columns import infer_column
from csv_connector.models import DetectedColumn, ScanResult

# Encodings we try, in order. UTF-8 first (with and without BOM), then
# the usual Windows / Latin-1 suspects.
_ENCODING_CANDIDATES = ("utf-8-sig", "utf-8", "cp1252", "latin-1")

# Delimiters considered plausible for csv.Sniffer.
_CANDIDATE_DELIMITERS = ",;\t|"

# How many bytes to read up front for sniffing encoding + dialect.
_SNIFF_BUFFER_BYTES = 64 * 1024

# How many lines to inspect for comment-header actors.
_COMMENT_LINE_LIMIT = 10


def _read_bytes(path: Path) -> bytes:
    return path.read_bytes()


def _decode(data: bytes) -> tuple[str, str]:
    """Return (decoded_text, encoding_used)."""
    for encoding in _ENCODING_CANDIDATES:
        try:
            return data.decode(encoding), encoding
        except UnicodeDecodeError:
            continue
    # Last-ditch: decode latin-1 with replacements (never raises).
    return data.decode("latin-1", errors="replace"), "latin-1"


def _split_comment_and_body(text: str) -> tuple[list[str], str]:
    """Strip leading comment lines (lines that start with '#') from the text.

    Returns (comment_lines, remaining_text). Only considers the first
    ``_COMMENT_LINE_LIMIT`` physical lines.
    """
    lines = text.splitlines(keepends=True)
    comments: list[str] = []
    idx = 0
    while idx < min(_COMMENT_LINE_LIMIT, len(lines)):
        line = lines[idx]
        stripped = line.lstrip()
        if stripped.startswith("#"):
            comments.append(stripped.rstrip("\r\n"))
            idx += 1
        else:
            break
    body = "".join(lines[idx:])
    return comments, body


def _sniff_dialect(sample: str) -> tuple[str, bool]:
    """Use csv.Sniffer to detect delimiter and whether the first row is a header.

    Falls back to comma + heuristic has_header when Sniffer can't determine one.
    """
    sniffer = csv.Sniffer()
    delimiter = ","
    try:
        dialect = sniffer.sniff(sample, delimiters=_CANDIDATE_DELIMITERS)
        delimiter = dialect.delimiter
    except csv.Error:
        # Fallback: pick the most common candidate on the first non-empty line.
        first_line = next((line for line in sample.splitlines() if line.strip()), "")
        if first_line:
            counts = {d: first_line.count(d) for d in _CANDIDATE_DELIMITERS}
            best = max(counts, key=lambda d: counts[d])
            if counts[best] > 0:
                delimiter = best

    try:
        has_header = sniffer.has_header(sample)
    except csv.Error:
        has_header = _heuristic_has_header(sample, delimiter)

    return delimiter, has_header


def _heuristic_has_header(sample: str, delimiter: str) -> bool:
    """If every cell in row 0 is non-numeric but row 1 has numerics → header."""
    rows = list(csv.reader(sample.splitlines()[:5], delimiter=delimiter))
    if len(rows) < 2:
        return False
    first, second = rows[0], rows[1]
    if len(first) != len(second):
        return False
    first_looks_textual = all(
        not _looks_numeric(cell) and cell.strip() != "" for cell in first
    )
    second_has_numeric = any(_looks_numeric(cell) for cell in second)
    return first_looks_textual and second_has_numeric


def _looks_numeric(cell: str) -> bool:
    s = cell.strip()
    if not s:
        return False
    try:
        float(s)
        return True
    except ValueError:
        return False


def scan_csv(path: str | Path) -> ScanResult:
    """Scan a CSV file and return everything we can detect.

    Args:
        path: Path to a .csv / .tsv / .txt file.

    Returns:
        A populated ScanResult. The caller is responsible for mapping it to
        Holocron API payloads (see csv_connector.mapping).
    """
    abs_path = str(Path(path).resolve())
    file_name = Path(path).name

    raw = _read_bytes(Path(path))
    text, encoding = _decode(raw)

    comment_lines, body = _split_comment_and_body(text)

    sample = body[:_SNIFF_BUFFER_BYTES]
    delimiter, has_header = _sniff_dialect(sample) if sample.strip() else (",", False)

    # Parse all rows with the detected dialect.
    reader = csv.reader(body.splitlines(), delimiter=delimiter)
    all_rows: list[list[str]] = [row for row in reader if row]  # drop blank rows

    if not all_rows:
        return ScanResult(
            file_path=abs_path,
            file_name=file_name,
            encoding=encoding,
            delimiter=delimiter,
            has_header=False,
            row_count=0,
            columns=[],
            actors=extract_actors(comment_lines),
            comment_lines=comment_lines,
        )

    if has_header:
        header_row = all_rows[0]
        data_rows = all_rows[1:]
        column_names = [name.strip() or f"col_{i}" for i, name in enumerate(header_row)]
    else:
        column_count = max(len(row) for row in all_rows)
        column_names = [f"col_{i}" for i in range(column_count)]
        data_rows = all_rows

    # Pad/truncate rows so every row has the same length as the column list.
    normalized_width = len(column_names)
    columns: list[DetectedColumn] = []
    for index, name in enumerate(column_names):
        values: list[str] = []
        for row in data_rows:
            values.append(row[index] if index < len(row) else "")
        columns.append(infer_column(name, index, values))

    _ = normalized_width  # silence unused — kept for documentation clarity
    actors = extract_actors(comment_lines)

    return ScanResult(
        file_path=abs_path,
        file_name=file_name,
        encoding=encoding,
        delimiter=delimiter,
        has_header=has_header,
        row_count=len(data_rows),
        columns=columns,
        actors=actors,
        comment_lines=comment_lines,
    )
