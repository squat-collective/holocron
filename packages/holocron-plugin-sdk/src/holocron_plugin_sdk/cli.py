"""``holocron-plugin`` — CLI for any registered Holocron plugin.

Three commands:

- ``list``  — show all plugins registered against an API instance
- ``show``  — pretty-print one plugin's manifest
- ``run``   — invoke a plugin with ``--input k=v`` arguments and stream the
  result back (JSON for IMPORT plugins, file for EXPORT plugins)

Default API URL: ``$HOLOCRON_API_URL`` env var, falling back to
``http://localhost:8100``.
"""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path
from typing import IO, Any

import httpx
import typer

DEFAULT_API_URL = os.environ.get("HOLOCRON_API_URL", "http://localhost:8100")
API_PREFIX = "/api/v1"
HTTP_TIMEOUT = 60.0

app = typer.Typer(
    help="CLI for Holocron plugins — list, inspect, and run any registered plugin.",
    no_args_is_help=True,
    add_completion=False,
)


def _api(api_url: str, path: str) -> str:
    return f"{api_url.rstrip('/')}{API_PREFIX}{path}"


def _build_headers(token: str | None) -> dict[str, str]:
    """Build outbound headers. ``--token`` is wired up-front so adding bearer
    auth on the API later is non-breaking, even if it's a no-op today."""
    if token:
        return {"Authorization": f"Bearer {token}"}
    return {}


def _client(token: str | None) -> httpx.Client:
    return httpx.Client(headers=_build_headers(token), timeout=HTTP_TIMEOUT)


def _abort_with_response(resp: httpx.Response, action: str) -> None:
    """Surface API errors with the server's message when present.

    422 is the canonical ``user-facing input error`` response from the plugin
    routes (see ``packages/api/src/holocron/plugins/routes.py``); we render it
    as a clean error line + non-zero exit so CI scripts can rely on the code.
    """
    detail: Any
    try:
        detail = resp.json().get("detail", resp.text)
    except (ValueError, json.JSONDecodeError):
        detail = resp.text or resp.reason_phrase
    typer.secho(f"[error] {action} failed ({resp.status_code}): {detail}", err=True, fg=typer.colors.RED)
    raise typer.Exit(code=2)


# ===== list =====


@app.command(name="list")
def list_cmd(
    api_url: str = typer.Option(DEFAULT_API_URL, "--api", help="Base URL of the Holocron API."),
    token: str | None = typer.Option(None, "--token", help="Optional bearer token."),
) -> None:
    """List all plugins registered against the API."""
    with _client(token) as client:
        try:
            resp = client.get(_api(api_url, "/plugins"))
        except httpx.HTTPError as exc:
            typer.secho(f"[error] could not reach {api_url}: {exc}", err=True, fg=typer.colors.RED)
            raise typer.Exit(code=2) from exc
    if resp.status_code >= 400:
        _abort_with_response(resp, "list")
    plugins = resp.json().get("plugins", [])
    if not plugins:
        typer.echo("No plugins registered.")
        return
    typer.echo(_render_plugin_table(plugins))


def _render_plugin_table(plugins: list[dict[str, Any]]) -> str:
    rows = [
        (p.get("slug", ""), p.get("capability", ""), p.get("version", ""), p.get("name", ""))
        for p in plugins
    ]
    headers = ("SLUG", "CAPABILITY", "VERSION", "NAME")
    widths = [
        max(len(headers[i]), *(len(row[i]) for row in rows))
        for i in range(len(headers))
    ]
    fmt = "  ".join(f"{{:<{w}}}" for w in widths)
    lines = [fmt.format(*headers), fmt.format(*("-" * w for w in widths))]
    lines.extend(fmt.format(*row) for row in rows)
    return "\n".join(lines)


# ===== show =====


@app.command()
def show(
    slug: str = typer.Argument(..., help="Plugin slug (see `holocron-plugin list`)."),
    api_url: str = typer.Option(DEFAULT_API_URL, "--api", help="Base URL of the Holocron API."),
    token: str | None = typer.Option(None, "--token", help="Optional bearer token."),
) -> None:
    """Print one plugin's manifest as pretty JSON.

    The API doesn't expose ``GET /plugins/{slug}`` — we fetch the full list and
    filter client-side. This stays correct as long as slugs are unique, which
    the registry enforces at load time.
    """
    with _client(token) as client:
        try:
            resp = client.get(_api(api_url, "/plugins"))
        except httpx.HTTPError as exc:
            typer.secho(f"[error] could not reach {api_url}: {exc}", err=True, fg=typer.colors.RED)
            raise typer.Exit(code=2) from exc
    if resp.status_code >= 400:
        _abort_with_response(resp, "show")
    plugins = resp.json().get("plugins", [])
    match = next((p for p in plugins if p.get("slug") == slug), None)
    if match is None:
        typer.secho(f"[error] plugin '{slug}' not found", err=True, fg=typer.colors.RED)
        raise typer.Exit(code=1)
    typer.echo(json.dumps(match, indent=2, ensure_ascii=False))


# ===== run =====


@app.command()
def run(
    slug: str = typer.Argument(..., help="Plugin slug to invoke."),
    inputs: list[str] = typer.Option(
        [],
        "--input",
        "-i",
        help="Plugin input as key=value. Repeatable. Use `key=@/path` for files, "
        "`key=true` / `key=false` for booleans, anything else is a string.",
    ),
    api_url: str = typer.Option(DEFAULT_API_URL, "--api", help="Base URL of the Holocron API."),
    token: str | None = typer.Option(None, "--token", help="Optional bearer token."),
    output: Path | None = typer.Option(
        None,
        "--output",
        "-o",
        help="Write the response body to this path. JSON pretty-prints to stdout when omitted; "
        "binary downloads use the server's Content-Disposition filename when omitted.",
    ),
) -> None:
    """Invoke a plugin against the API.

    The body is sent as ``multipart/form-data`` so file inputs round-trip
    untouched. JSON responses (IMPORT plugins) pretty-print to stdout; binary
    responses (EXPORT plugins) save to ``--output`` or to the filename hinted
    by ``Content-Disposition``.
    """
    files, fields = _parse_inputs(inputs)
    try:
        with _client(token) as client:
            resp = client.post(
                _api(api_url, f"/plugins/{slug}/run"),
                data=fields,
                files=files,
            )
    except httpx.HTTPError as exc:
        typer.secho(f"[error] could not reach {api_url}: {exc}", err=True, fg=typer.colors.RED)
        raise typer.Exit(code=2) from exc
    finally:
        for _, payload in files:
            handle = payload[1]
            if hasattr(handle, "close"):
                handle.close()

    if resp.status_code >= 400:
        _abort_with_response(resp, f"run {slug}")

    _emit_response(resp, output)


def _parse_inputs(raw: list[str]) -> tuple[list[tuple[str, tuple[str, IO[bytes], str]]], dict[str, str]]:
    """Split ``--input`` arguments into multipart files and form fields.

    Rules:

    - ``key=@/path`` → file upload (raises if the path is missing).
    - ``key=true`` / ``key=false`` (case-insensitive) → boolean field, lowered.
    - anything else → string field.

    Booleans go through as form fields because the API parses them from the
    string form (see ``_collect_inputs`` in the plugins route): ``true`` /
    ``false`` / ``1`` / ``0`` are all accepted there.
    """
    files: list[tuple[str, tuple[str, IO[bytes], str]]] = []
    fields: dict[str, str] = {}
    for item in raw:
        if "=" not in item:
            typer.secho(
                f"[error] --input '{item}' is missing '='. Use key=value.",
                err=True,
                fg=typer.colors.RED,
            )
            raise typer.Exit(code=1)
        key, _, value = item.partition("=")
        if not key:
            typer.secho(
                f"[error] --input '{item}' has an empty key.", err=True, fg=typer.colors.RED
            )
            raise typer.Exit(code=1)

        if value.startswith("@"):
            path = Path(value[1:]).expanduser()
            if not path.is_file():
                typer.secho(
                    f"[error] --input {key}: file '{path}' does not exist.",
                    err=True,
                    fg=typer.colors.RED,
                )
                raise typer.Exit(code=1)
            handle = path.open("rb")
            files.append((key, (path.name, handle, "application/octet-stream")))
        elif value.lower() in ("true", "false"):
            fields[key] = value.lower()
        else:
            fields[key] = value
    return files, fields


def _emit_response(resp: httpx.Response, output: Path | None) -> None:
    """Either pretty-print JSON to stdout or save bytes to a file.

    JSON detection is content-type based; the API uses ``application/json`` for
    SummaryResult and the plugin's declared media type for DownloadResult.
    """
    content_type = resp.headers.get("content-type", "").lower()
    if "application/json" in content_type:
        payload = resp.json()
        rendered = json.dumps(payload, indent=2, ensure_ascii=False)
        if output is not None:
            output.write_text(rendered + "\n", encoding="utf-8")
            typer.echo(f"saved JSON response to {output}")
            return
        typer.echo(rendered)
        return

    target = output or _filename_from_response(resp)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(resp.content)
    size = len(resp.content)
    typer.echo(f"saved {size} bytes to {target}")


_DISPOSITION_FILENAME = re.compile(r'filename="?([^";]+)"?')


def _filename_from_response(resp: httpx.Response) -> Path:
    """Extract the download filename from ``Content-Disposition``.

    Falls back to ``download.bin`` when the header is absent so the CLI
    always writes *something* the user can inspect — silently dumping bytes
    to stdout is hostile.
    """
    disposition = resp.headers.get("content-disposition", "")
    match = _DISPOSITION_FILENAME.search(disposition)
    if match:
        return Path(match.group(1))
    return Path("download.bin")


if __name__ == "__main__":  # pragma: no cover
    app()
