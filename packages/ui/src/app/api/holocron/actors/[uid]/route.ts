import { NextResponse } from "next/server";
import { handleError } from "@/lib/api-route";
import { holocron } from "@/lib/holocron";

interface RouteParams {
	params: Promise<{ uid: string }>;
}

/**
 * GET /api/holocron/actors/:uid
 * Get a single actor by UID
 */
export async function GET(_request: Request, { params }: RouteParams) {
	try {
		const { uid } = await params;
		const actor = await holocron.actors.get(uid);
		return NextResponse.json(actor);
	} catch (error) {
		return handleError(error);
	}
}

/**
 * PUT /api/holocron/actors/:uid
 * Update an actor
 */
export async function PUT(request: Request, { params }: RouteParams) {
	try {
		const { uid } = await params;
		const body = await request.json();
		const actor = await holocron.actors.update(uid, body);
		return NextResponse.json(actor);
	} catch (error) {
		return handleError(error);
	}
}

/**
 * DELETE /api/holocron/actors/:uid
 * Delete an actor
 */
export async function DELETE(_request: Request, { params }: RouteParams) {
	try {
		const { uid } = await params;
		await holocron.actors.delete(uid);
		return new NextResponse(null, { status: 204 });
	} catch (error) {
		return handleError(error);
	}
}
