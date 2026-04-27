"""Build CSV fixture files programmatically — no binary files in the repo."""

from __future__ import annotations

from pathlib import Path

import pytest


def _write(path: Path, text: str, encoding: str = "utf-8") -> Path:
    path.write_bytes(text.encode(encoding))
    return path


@pytest.fixture
def simple_csv(tmp_path: Path) -> Path:
    """Standard comma-delimited CSV with a clear header."""
    text = "id,name,amount\n1,Widget,9.99\n2,Gadget,19.50\n3,Doohickey,4.25\n"
    return _write(tmp_path / "simple.csv", text)


@pytest.fixture
def semicolon_csv(tmp_path: Path) -> Path:
    """European-style semicolon-delimited CSV."""
    text = "id;name;price\n1;Widget;9,99\n2;Gadget;19,50\n"
    return _write(tmp_path / "semicolon.csv", text)


@pytest.fixture
def tsv(tmp_path: Path) -> Path:
    """Tab-separated file."""
    text = "sku\tqty\tprice\nA-1\t10\t1.5\nA-2\t20\t2.5\nA-3\t30\t3.5\n"
    return _write(tmp_path / "inventory.tsv", text)


@pytest.fixture
def pipe_csv(tmp_path: Path) -> Path:
    """Pipe-delimited CSV."""
    text = "id|name|active\n1|Widget|true\n2|Gadget|false\n3|Thing|true\n"
    return _write(tmp_path / "pipe.csv", text)


@pytest.fixture
def headerless_csv(tmp_path: Path) -> Path:
    """No header row — first row is all numeric, sniffer should detect no header."""
    text = "1,2,3\n4,5,6\n7,8,9\n10,11,12\n"
    return _write(tmp_path / "headerless.csv", text)


@pytest.fixture
def commented_csv(tmp_path: Path) -> Path:
    """CSV with leading # comment lines that include Owner/Author metadata."""
    text = (
        "# Owner: finance.team@acme.com\n"
        "# Author: Jean Dupont\n"
        "# Generated: 2026-04-19\n"
        "id,name,amount\n"
        "1,Widget,9.99\n"
        "2,Gadget,19.50\n"
    )
    return _write(tmp_path / "commented.csv", text)


@pytest.fixture
def latin1_csv(tmp_path: Path) -> Path:
    """CSV encoded in cp1252 with accented characters (cannot decode as UTF-8)."""
    text = "id,name\n1,Café\n2,Zoé\n3,François\n"
    # cp1252 is what the Windows-style "Café" would produce
    return _write(tmp_path / "latin1.csv", text, encoding="cp1252")


@pytest.fixture
def mixed_types_csv(tmp_path: Path) -> Path:
    """Numeric column mixing ints and floats → should be promoted to float."""
    text = "id,measurement\n1,1\n2,2.5\n3,3\n4,4.75\n5,5\n"
    return _write(tmp_path / "mixed.csv", text)


@pytest.fixture
def dated_csv(tmp_path: Path) -> Path:
    """Column with ISO dates and column with ISO datetimes."""
    text = (
        "id,created_on,created_at\n"
        "1,2026-01-01,2026-01-01T10:00:00\n"
        "2,2026-02-01,2026-02-01T11:30:00\n"
        "3,2026-03-01,2026-03-01T12:45:00\n"
    )
    return _write(tmp_path / "dated.csv", text)


@pytest.fixture
def booleans_csv(tmp_path: Path) -> Path:
    """Column of true/false values."""
    text = "id,active\n1,true\n2,false\n3,true\n4,false\n"
    return _write(tmp_path / "booleans.csv", text)


@pytest.fixture
def ragged_csv(tmp_path: Path) -> Path:
    """Some rows shorter than the header — should be padded, not crash."""
    text = "a,b,c\n1,2,3\n4,5\n6,7,8\n"
    return _write(tmp_path / "ragged.csv", text)


@pytest.fixture
def quoted_csv(tmp_path: Path) -> Path:
    """Fields with commas inside quotes must survive parsing."""
    text = 'id,name,notes\n1,"Smith, John","says ""hi"""\n2,Doe,plain\n'
    return _write(tmp_path / "quoted.csv", text)


@pytest.fixture
def empty_csv(tmp_path: Path) -> Path:
    """File with only comments, no data at all."""
    text = "# Owner: lonely@acme.com\n"
    return _write(tmp_path / "empty.csv", text)
