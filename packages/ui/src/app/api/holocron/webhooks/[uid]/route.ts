import { NextResponse } from "next/server";
import { handleError } from "@/lib/api-route";
import { holocron } from "@/lib/holocron";

interface RouteParams {
	params: Promise<{ uid: string }>;
}

/**
 * GET /api/holocron/webhooks/:uid
 * Get a single webhook by UID.
 */
export async function GET(_request: Request, { params }: RouteParams) {
	try {
		const { uid } = await params;
		const webhook = await holocron.webhooks.get(uid);
		return NextResponse.json(webhook);
	} catch (error) {
		return handleError(error);
	}
}

/**
 * PUT /api/holocron/webhooks/:uid
 * Partial update. Setting `disabled: false` re-enables a webhook that
 * was auto-disabled and clears the failure counter.
 */
export async function PUT(request: Request, { params }: RouteParams) {
	try {
		const { uid } = await params;
		const body = await request.json();
		const webhook = await holocron.webhooks.update(uid, body);
		return NextResponse.json(webhook);
	} catch (error) {
		return handleError(error);
	}
}

/**
 * DELETE /api/holocron/webhooks/:uid
 * Remove a webhook subscription.
 */
export async function DELETE(_request: Request, { params }: RouteParams) {
	try {
		const { uid } = await params;
		await holocron.webhooks.delete(uid);
		return new NextResponse(null, { status: 204 });
	} catch (error) {
		return handleError(error);
	}
}
