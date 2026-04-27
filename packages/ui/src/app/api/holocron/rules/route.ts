import type { NextResponse } from "next/server";
import { proxyJson } from "@/lib/api-route";

/**
 * GET /api/holocron/rules — list rules, optional ?category= and ?severity= filters.
 */
export async function GET(request: Request): Promise<NextResponse> {
	const { searchParams } = new URL(request.url);
	const qs = searchParams.toString();
	return proxyJson(`/api/v1/rules${qs ? `?${qs}` : ""}`);
}

/**
 * POST /api/holocron/rules — create a new rule.
 */
export async function POST(request: Request): Promise<NextResponse> {
	const body = await request.json();
	return proxyJson("/api/v1/rules", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}
