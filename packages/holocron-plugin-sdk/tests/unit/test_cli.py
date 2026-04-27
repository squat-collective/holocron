"""CLI tests — run the typer app against a mock httpx transport.

We monkeypatch ``cli._client`` to return an ``httpx.Client`` backed by
``httpx.MockTransport``, so tests exercise the real argument parsing and
multipart wiring without an actual server.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

import httpx
import pytest
from typer.testing import CliRunner

from holocron_plugin_sdk import cli

runner = CliRunner()


# ===== helpers =====


def _install_transport(
    monkeypatch: pytest.MonkeyPatch,
    handler: Callable[[httpx.Request], httpx.Response],
) -> list[httpx.Request]:
    """Swap cli._client for one wired to a MockTransport.

    Returns the list of captured requests so tests can assert on what got sent.
    """
    captured: list[httpx.Request] = []

    def capturing_handler(request: httpx.Request) -> httpx.Response:
        captured.append(request)
        return handler(request)

    transport = httpx.MockTransport(capturing_handler)

    def fake_client(token: str | None) -> httpx.Client:
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        return httpx.Client(transport=transport, headers=headers, timeout=cli.HTTP_TIMEOUT)

    monkeypatch.setattr(cli, "_client", fake_client)
    return captured


def _manifest(
    slug: str,
    *,
    capability: str = "import",
    inputs: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    return {
        "slug": slug,
        "name": slug.replace("-", " ").title(),
        "description": f"{slug} plugin",
        "icon": "🧩",
        "version": "0.1.0",
        "capability": capability,
        "inputs": inputs or [],
        "review_link": None,
    }


# ===== list =====


class TestList:
    def test_list_renders_table(self, monkeypatch: pytest.MonkeyPatch) -> None:
        plugins = [
            _manifest("excel-connector", capability="import"),
            _manifest("excel-exporter", capability="export"),
        ]
        _install_transport(
            monkeypatch,
            lambda req: httpx.Response(200, json={"plugins": plugins}),
        )

        result = runner.invoke(cli.app, ["list"])
        assert result.exit_code == 0, result.stderr
        assert "SLUG" in result.stdout
        assert "excel-connector" in result.stdout
        assert "excel-exporter" in result.stdout
        assert "import" in result.stdout
        assert "export" in result.stdout

    def test_list_empty(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _install_transport(
            monkeypatch,
            lambda req: httpx.Response(200, json={"plugins": []}),
        )
        result = runner.invoke(cli.app, ["list"])
        assert result.exit_code == 0
        assert "No plugins registered" in result.stdout

    def test_list_unreachable_api_exits_2(self, monkeypatch: pytest.MonkeyPatch) -> None:
        def boom(_req: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("nope")

        _install_transport(monkeypatch, boom)
        result = runner.invoke(cli.app, ["list", "--api", "http://offline.example"])
        assert result.exit_code == 2
        assert "could not reach" in result.stderr

    def test_list_includes_token_when_provided(self, monkeypatch: pytest.MonkeyPatch) -> None:
        captured = _install_transport(
            monkeypatch,
            lambda req: httpx.Response(200, json={"plugins": []}),
        )
        result = runner.invoke(cli.app, ["list", "--token", "abc"])
        assert result.exit_code == 0
        assert captured[0].headers.get("authorization") == "Bearer abc"


# ===== show =====


class TestShow:
    def test_show_renders_matching_manifest(self, monkeypatch: pytest.MonkeyPatch) -> None:
        plugins = [_manifest("a"), _manifest("b")]
        _install_transport(
            monkeypatch,
            lambda req: httpx.Response(200, json={"plugins": plugins}),
        )
        result = runner.invoke(cli.app, ["show", "b"])
        assert result.exit_code == 0
        payload = json.loads(result.stdout)
        assert payload["slug"] == "b"

    def test_show_missing_slug_exits_1(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _install_transport(
            monkeypatch,
            lambda req: httpx.Response(200, json={"plugins": [_manifest("a")]}),
        )
        result = runner.invoke(cli.app, ["show", "ghost"])
        assert result.exit_code == 1
        assert "ghost" in result.stderr


# ===== run: input parsing =====


class TestRunInputs:
    def test_run_string_input_goes_in_form_fields(self, monkeypatch: pytest.MonkeyPatch) -> None:
        captured = _install_transport(
            monkeypatch,
            lambda req: httpx.Response(
                200,
                json={"title": "ok", "counts": {}, "samples": [], "extra": {}},
                headers={"content-type": "application/json"},
            ),
        )
        result = runner.invoke(
            cli.app, ["run", "x", "--input", "host=db.local", "--input", "schema=public"]
        )
        assert result.exit_code == 0, result.stderr
        body = captured[0].read().decode("utf-8", errors="replace")
        # No file uploads → httpx sends application/x-www-form-urlencoded; with
        # files it would be multipart. Both encodings carry the same name=value
        # pairs, which the API parses uniformly via Starlette's request.form().
        assert "host=db.local" in body or 'name="host"' in body
        assert "schema=public" in body or 'name="schema"' in body

    def test_run_boolean_input_lowercased(self, monkeypatch: pytest.MonkeyPatch) -> None:
        captured = _install_transport(
            monkeypatch,
            lambda req: httpx.Response(
                200,
                json={"title": "", "counts": {}, "samples": [], "extra": {}},
                headers={"content-type": "application/json"},
            ),
        )
        result = runner.invoke(
            cli.app, ["run", "x", "--input", "verbose=True", "--input", "dry_run=FALSE"]
        )
        assert result.exit_code == 0
        body = captured[0].read().decode("utf-8", errors="replace")
        assert "verbose=true" in body or "verbose%3Dtrue" in body or "true" in body
        assert "dry_run=false" in body or "false" in body

    def test_run_file_input_uploaded_as_multipart(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        captured = _install_transport(
            monkeypatch,
            lambda req: httpx.Response(
                200,
                json={"title": "", "counts": {}, "samples": [], "extra": {}},
                headers={"content-type": "application/json"},
            ),
        )
        sample = tmp_path / "input.csv"
        sample.write_text("col\nval\n")

        result = runner.invoke(cli.app, ["run", "x", "--input", f"file=@{sample}"])
        assert result.exit_code == 0, result.stderr
        body = captured[0].read()
        assert b'filename="input.csv"' in body
        assert b"col\nval" in body

    def test_run_missing_file_exits_1(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        _install_transport(
            monkeypatch,
            lambda req: httpx.Response(200, json={}),
        )
        result = runner.invoke(cli.app, ["run", "x", "--input", f"file=@{tmp_path / 'ghost.csv'}"])
        assert result.exit_code == 1
        assert "does not exist" in result.stderr

    def test_run_input_without_equals_exits_1(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _install_transport(
            monkeypatch,
            lambda req: httpx.Response(200, json={}),
        )
        result = runner.invoke(cli.app, ["run", "x", "--input", "broken"])
        assert result.exit_code == 1
        assert "missing '='" in result.stderr


# ===== run: response handling =====


class TestRunOutput:
    def test_json_response_pretty_prints(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _install_transport(
            monkeypatch,
            lambda req: httpx.Response(
                200,
                json={"title": "Done", "counts": {"created": 3}, "samples": [], "extra": {}},
                headers={"content-type": "application/json"},
            ),
        )
        result = runner.invoke(cli.app, ["run", "x"])
        assert result.exit_code == 0, result.stderr
        # Pretty-printed JSON is multi-line and contains both keys.
        assert '"title": "Done"' in result.stdout
        assert '"created": 3' in result.stdout

    def test_json_response_writes_to_output_file(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        _install_transport(
            monkeypatch,
            lambda req: httpx.Response(
                200,
                json={"title": "Done", "counts": {}, "samples": [], "extra": {}},
                headers={"content-type": "application/json"},
            ),
        )
        target = tmp_path / "summary.json"
        result = runner.invoke(cli.app, ["run", "x", "--output", str(target)])
        assert result.exit_code == 0
        payload = json.loads(target.read_text())
        assert payload["title"] == "Done"

    def test_binary_response_uses_content_disposition_filename(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path, monkeypatch_workdir: None
    ) -> None:
        _install_transport(
            monkeypatch,
            lambda req: httpx.Response(
                200,
                content=b"PK\x03\x04binary",
                headers={
                    "content-type": "application/zip",
                    "content-disposition": 'attachment; filename="report.zip"',
                },
            ),
        )
        result = runner.invoke(cli.app, ["run", "x"])
        assert result.exit_code == 0, result.stderr
        out_path = Path("report.zip")
        assert out_path.exists()
        assert out_path.read_bytes().startswith(b"PK")

    def test_binary_response_falls_back_to_download_bin(
        self, monkeypatch: pytest.MonkeyPatch, monkeypatch_workdir: None
    ) -> None:
        _install_transport(
            monkeypatch,
            lambda req: httpx.Response(
                200,
                content=b"\x00\x01\x02",
                headers={"content-type": "application/octet-stream"},
            ),
        )
        result = runner.invoke(cli.app, ["run", "x"])
        assert result.exit_code == 0
        assert Path("download.bin").exists()

    def test_binary_response_writes_to_explicit_output(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        _install_transport(
            monkeypatch,
            lambda req: httpx.Response(
                200,
                content=b"hello",
                headers={
                    "content-type": "text/plain",
                    "content-disposition": 'attachment; filename="server.txt"',
                },
            ),
        )
        target = tmp_path / "subdir" / "out.txt"
        result = runner.invoke(cli.app, ["run", "x", "--output", str(target)])
        assert result.exit_code == 0
        assert target.read_bytes() == b"hello"


# ===== run: error mapping =====


class TestRunErrors:
    def test_422_renders_friendly_error_and_exits_2(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _install_transport(
            monkeypatch,
            lambda req: httpx.Response(422, json={"detail": "missing input 'host'"}),
        )
        result = runner.invoke(cli.app, ["run", "x"])
        assert result.exit_code == 2
        assert "missing input 'host'" in result.stderr
        assert "(422)" in result.stderr

    def test_404_renders_friendly_error(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _install_transport(
            monkeypatch,
            lambda req: httpx.Response(404, json={"detail": "Plugin 'ghost' not found"}),
        )
        result = runner.invoke(cli.app, ["run", "ghost"])
        assert result.exit_code == 2
        assert "ghost" in result.stderr


# ===== fixtures =====


@pytest.fixture
def monkeypatch_workdir(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Run the test in a clean tmp dir so files written via Content-Disposition
    fallback land somewhere isolated."""
    monkeypatch.chdir(tmp_path)
