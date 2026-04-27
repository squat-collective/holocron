import type { NextResponse } from "next/server";
import { proxyJson } from "@/lib/api-route";

/**
 * GET /api/holocron/events
 * Audit-trail proxy. Pass-through for `entity_uid`, `entity_type`,
 * `action`, `limit`, `offset` — see `/api/v1/events` for the contract.
 */
export async function GET(request: Request): Promise<NextResponse> {
	const { searchParams } = new URL(request.url);
	const qs = searchParams.toString();
	return proxyJson(`/api/v1/events${qs ? `?${qs}` : ""}`);
}
