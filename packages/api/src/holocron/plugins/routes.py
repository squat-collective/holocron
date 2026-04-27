"""Generic plugin endpoints — auto-mounted, no per-plugin code in the API."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from holocron.api.dependencies import (
    get_actor_service,
    get_asset_service,
    get_event_service,
    get_relation_service,
    get_rule_service,
)
from holocron.core.services.actor_service import ActorService
from holocron.core.services.asset_service import AssetService
from holocron.core.services.event_service import EventService
from holocron.core.services.relation_service import RelationService
from holocron.core.services.rule_service import RuleService
from holocron.plugins.base import (
    DownloadResult,
    InputType,
    PluginContext,
    PluginManifest,
    SummaryResult,
)
from holocron.plugins.registry import get_registry

router = APIRouter(prefix="/plugins", tags=["plugins"])


class PluginListResponse(BaseModel):
    plugins: list[PluginManifest]


@router.get("", response_model=PluginListResponse)
async def list_plugins() -> PluginListResponse:
    """Return all registered plugin manifests for UI auto-discovery."""
    return PluginListResponse(plugins=get_registry().manifests())


@router.post("/{slug}/run")
async def run_plugin(
    slug: str,
    request: Request,
    asset_service: AssetService = Depends(get_asset_service),
    actor_service: ActorService = Depends(get_actor_service),
    relation_service: RelationService = Depends(get_relation_service),
    rule_service: RuleService = Depends(get_rule_service),
    event_service: EventService = Depends(get_event_service),
) -> Any:
    """Run a plugin. Multipart inputs are parsed against the manifest.

    - SummaryResult → returned as JSON
    - DownloadResult → streamed back with an attachment Content-Disposition
    """
    plugin = get_registry().get(slug)
    if plugin is None:
        raise HTTPException(status_code=404, detail=f"Plugin '{slug}' not found")

    inputs = await _collect_inputs(request, plugin.manifest)

    ctx = PluginContext(
        asset_service=asset_service,
        actor_service=actor_service,
        relation_service=relation_service,
        rule_service=rule_service,
        event_service=event_service,
    )
    try:
        result = await plugin.run(ctx, inputs)
    except ValueError as exc:
        # Plugins use ValueError as the canonical "user-facing input
        # error" — bad credentials, unsupported file format, missing
        # field. 422 lets the UI surface the message in the plugin-run
        # wizard's error pane instead of a generic 500.
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    if isinstance(result, DownloadResult):
        return StreamingResponse(
            iter([result.body]),
            media_type=result.content_type,
            headers={"Content-Disposition": f'attachment; filename="{result.filename}"'},
        )
    if isinstance(result, SummaryResult):
        return result.model_dump(mode="json")
    raise HTTPException(
        status_code=500,
        detail=f"Plugin '{slug}' returned an unsupported result type: {type(result).__name__}",
    )


async def _collect_inputs(request: Request, manifest: PluginManifest) -> dict[str, Any]:
    """Read multipart form data and validate it against the manifest's input spec."""
    if not manifest.inputs:
        return {}

    # FastAPI's request.form() handles both multipart/form-data and url-encoded bodies.
    form = await request.form()

    inputs: dict[str, Any] = {}
    for spec in manifest.inputs:
        raw = form.get(spec.name)
        if raw is None or raw == "":
            if spec.required and spec.default is None:
                raise HTTPException(
                    status_code=400,
                    detail=f"Plugin '{manifest.slug}' requires input '{spec.name}'",
                )
            inputs[spec.name] = spec.default
            continue

        if spec.type == InputType.FILE:
            inputs[spec.name] = raw  # starlette UploadFile
        elif spec.type == InputType.BOOLEAN:
            inputs[spec.name] = str(raw).lower() in ("1", "true", "on", "yes")
        else:  # STRING
            inputs[spec.name] = str(raw)

    return inputs
