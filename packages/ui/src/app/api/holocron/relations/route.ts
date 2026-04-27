import type { NextResponse } from "next/server";
import { proxyJson } from "@/lib/api-route";

/**
 * GET /api/holocron/relations
 * List all relations with optional filters (passes query string through).
 */
export async function GET(request: Request): Promise<NextResponse> {
	const { searchParams } = new URL(request.url);
	const qs = searchParams.toString();
	return proxyJson(`/api/v1/relations${qs ? `?${qs}` : ""}`);
}

/**
 * POST /api/holocron/relations
 * Forward raw API shape ({from_uid, to_uid, type, verified?, properties?}).
 * Bypasses the SDK so we don't collide with its (from, to) shape.
 */
export async function POST(request: Request): Promise<NextResponse> {
	const body = await request.json();
	return proxyJson("/api/v1/relations", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}
