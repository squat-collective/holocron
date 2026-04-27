import { NextResponse } from "next/server";
import { handleError } from "@/lib/api-route";
import { holocron } from "@/lib/holocron";

interface RouteParams {
	params: Promise<{ uid: string }>;
}

/**
 * GET /api/holocron/assets/:uid
 * Get a single asset by UID
 */
export async function GET(_request: Request, { params }: RouteParams) {
	try {
		const { uid } = await params;
		const asset = await holocron.assets.get(uid);
		return NextResponse.json(asset);
	} catch (error) {
		return handleError(error);
	}
}

/**
 * PUT /api/holocron/assets/:uid
 * Update an asset
 */
export async function PUT(request: Request, { params }: RouteParams) {
	try {
		const { uid } = await params;
		const body = await request.json();
		const asset = await holocron.assets.update(uid, body);
		return NextResponse.json(asset);
	} catch (error) {
		return handleError(error);
	}
}

/**
 * DELETE /api/holocron/assets/:uid
 * Delete an asset
 */
export async function DELETE(_request: Request, { params }: RouteParams) {
	try {
		const { uid } = await params;
		await holocron.assets.delete(uid);
		return new NextResponse(null, { status: 204 });
	} catch (error) {
		return handleError(error);
	}
}
