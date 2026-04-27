import type { NextResponse } from "next/server";
import { proxyJson } from "@/lib/api-route";

interface RouteParams {
	params: Promise<{ uid: string }>;
}

/**
 * GET /api/holocron/rules/for-asset/[uid]
 * Returns rules applied to an asset with their enforcement context.
 */
export async function GET(_request: Request, { params }: RouteParams): Promise<NextResponse> {
	const { uid } = await params;
	return proxyJson(`/api/v1/rules/for-asset/${uid}`);
}
