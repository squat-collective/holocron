import { NextResponse } from "next/server";
import { handleError } from "@/lib/api-route";
import { holocron } from "@/lib/holocron";

interface RouteParams {
	params: Promise<{ uid: string }>;
}

/**
 * GET /api/holocron/assets/:uid/tree?depth=N
 * Walk the `contains` tree rooted at this asset.
 */
export async function GET(request: Request, { params }: RouteParams) {
	try {
		const { uid } = await params;
		const url = new URL(request.url);
		const depthParam = url.searchParams.get("depth");
		const depth = depthParam ? Number.parseInt(depthParam, 10) : undefined;
		const tree = await holocron.assets.tree(
			uid,
			depth !== undefined && Number.isFinite(depth) ? { depth } : undefined,
		);
		return NextResponse.json(tree);
	} catch (error) {
		return handleError(error);
	}
}
