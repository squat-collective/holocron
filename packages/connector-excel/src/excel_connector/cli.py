"""CLI entry point: holocron-excel scan PATH ..."""

from __future__ import annotations

import json
from pathlib import Path

import typer

from excel_connector import scan_workbook
from excel_connector.client import HolocronClient
from excel_connector.mapping import map_scan_to_holocron

app = typer.Typer(help="Holocron Excel connector — scan .xlsx files and push to the Holocron API.")


@app.command()
def scan(
    path: Path = typer.Argument(..., exists=True, dir_okay=False, readable=True),
    api_url: str = typer.Option(
        "http://localhost:8100",
        "--api-url",
        help="Base URL of the Holocron API (no trailing /api/v1).",
    ),
    token: str | None = typer.Option(
        None, "--token", help="Optional bearer token for the API."
    ),
    dry_run: bool = typer.Option(
        False, "--dry-run", help="Print the mapped payloads without pushing to the API."
    ),
) -> None:
    """Scan an Excel workbook and push its assets/actors/relations to the Holocron API."""
    typer.echo(f"📊  scanning {path}")
    result = scan_workbook(path)

    typer.echo(
        f"   sheets={len(result.sheets)}  "
        f"tables={sum(len(s.tables) for s in result.sheets)}  "
        f"external_links={len(result.external_links)}  "
        f"actors={len(result.actors)}"
    )

    mapped = map_scan_to_holocron(result)
    typer.echo(
        f"📦  mapped: {len(mapped.assets)} assets · "
        f"{len(mapped.actors)} actors · {len(mapped.relations)} relations"
    )

    if dry_run:
        typer.echo("--- dry run, not pushing ---")
        typer.echo(
            json.dumps(
                {
                    "assets": [a.__dict__ for a in mapped.assets],
                    "actors": [a.__dict__ for a in mapped.actors],
                    "relations": [r.__dict__ for r in mapped.relations],
                },
                indent=2,
                default=str,
            )
        )
        return

    typer.echo(f"🚀  pushing to {api_url}")
    with HolocronClient(api_url, token=token) as client:
        summary = client.push_scan(mapped)

    typer.echo(
        "✅  done: "
        f"assets created={summary.assets_created} updated={summary.assets_updated}; "
        f"actors created={summary.actors_created} updated={summary.actors_updated}; "
        f"relations created={summary.relations_created} skipped={summary.relations_skipped_existing}"
    )


if __name__ == "__main__":  # pragma: no cover
    app()
