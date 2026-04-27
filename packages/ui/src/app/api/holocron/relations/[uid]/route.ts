import { NextResponse } from "next/server";
import { handleError } from "@/lib/api-route";
import { holocron } from "@/lib/holocron";

interface RouteParams {
	params: Promise<{ uid: string }>;
}

/**
 * DELETE /api/holocron/relations/:uid
 * Delete a relation
 * Note: Relations cannot be updated, only created or deleted
 */
export async function DELETE(_request: Request, { params }: RouteParams) {
	try {
		const { uid } = await params;
		await holocron.relations.delete(uid);
		return new NextResponse(null, { status: 204 });
	} catch (error) {
		return handleError(error);
	}
}
