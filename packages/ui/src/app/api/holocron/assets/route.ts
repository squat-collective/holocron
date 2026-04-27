import { NextResponse } from "next/server";
import { handleError, proxyJson } from "@/lib/api-route";
import { holocron } from "@/lib/holocron";

/**
 * GET /api/holocron/assets
 * List assets with optional filters. Pass-through query string lets the
 * Python API own the filter contract — including the governance filters
 * (`verified`, `has_owner`, `has_description`) that the SDK doesn't
 * surface yet.
 */
export async function GET(request: Request) {
	const { searchParams } = new URL(request.url);
	const qs = searchParams.toString();
	return proxyJson(`/api/v1/assets${qs ? `?${qs}` : ""}`);
}

/**
 * POST /api/holocron/assets
 * Create a new asset
 */
export async function POST(request: Request) {
	try {
		const body = await request.json();
		const asset = await holocron.assets.create(body);
		return NextResponse.json(asset, { status: 201 });
	} catch (error) {
		return handleError(error);
	}
}
