import { NextResponse } from "next/server";
import { handleError } from "@/lib/api-route";
import { holocron } from "@/lib/holocron";

/**
 * GET /api/holocron/actors
 * List all actors with optional filters
 */
export async function GET(request: Request) {
	try {
		const { searchParams } = new URL(request.url);
		const limit = searchParams.get("limit");
		const offset = searchParams.get("offset");

		const result = await holocron.actors.list({
			limit: limit ? Number.parseInt(limit, 10) : undefined,
			offset: offset ? Number.parseInt(offset, 10) : undefined,
		});

		return NextResponse.json(result);
	} catch (error) {
		return handleError(error);
	}
}

/**
 * POST /api/holocron/actors
 * Create a new actor
 */
export async function POST(request: Request) {
	try {
		const body = await request.json();
		const actor = await holocron.actors.create(body);
		return NextResponse.json(actor, { status: 201 });
	} catch (error) {
		return handleError(error);
	}
}
