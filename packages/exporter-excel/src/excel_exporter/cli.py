"""CLI entry point: holocron-excel-export ..."""

from __future__ import annotations

from pathlib import Path

import typer

from excel_exporter import export_catalog

app = typer.Typer(help="Export the Holocron catalog to a single .xlsx file.")


@app.command()
def export(
    output: Path = typer.Option(
        ..., "--output", "-o", help="Where to write the .xlsx file."
    ),
    api_url: str = typer.Option(
        "http://localhost:8100",
        "--api-url",
        help="Base URL of the Holocron API (no trailing /api/v1).",
    ),
    token: str | None = typer.Option(
        None, "--token", help="Optional bearer token for the API."
    ),
) -> None:
    """Fetch the catalog from the API and save it to an .xlsx file."""
    typer.echo(f"📤  fetching catalog from {api_url}")
    snapshot = export_catalog(api_url=api_url, output_path=str(output), token=token)
    typer.echo(
        f"✅  wrote {output}  "
        f"(assets={len(snapshot.assets)}, actors={len(snapshot.actors)}, "
        f"relations={len(snapshot.relations)})"
    )


if __name__ == "__main__":  # pragma: no cover
    app()
