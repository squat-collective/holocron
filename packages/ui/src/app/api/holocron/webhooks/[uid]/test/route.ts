import { NextResponse } from "next/server";
import { handleError } from "@/lib/api-route";
import { holocron } from "@/lib/holocron";

interface RouteParams {
	params: Promise<{ uid: string }>;
}

/**
 * POST /api/holocron/webhooks/:uid/test
 * Fire a synthetic event at the receiver so admins can verify wiring
 * without mutating live data. Returns `{ delivered: boolean }`. A
 * failed delivery still counts toward the auto-disable threshold —
 * same path real events take.
 */
export async function POST(_request: Request, { params }: RouteParams) {
	try {
		const { uid } = await params;
		const result = await holocron.webhooks.test(uid);
		return NextResponse.json(result);
	} catch (error) {
		return handleError(error);
	}
}
