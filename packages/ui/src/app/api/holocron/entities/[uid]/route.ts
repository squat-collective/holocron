import { NextResponse } from "next/server";
import { handleError } from "@/lib/api-route";
import { holocron } from "@/lib/holocron";

interface RouteParams {
	params: Promise<{ uid: string }>;
}

/**
 * GET /api/holocron/entities/:uid
 *
 * Polymorphic resolver — returns a discriminated union with `kind` set
 * to "asset" | "actor" | "rule" and exactly one of those fields
 * populated. Lets the UI fetch counterparties without first guessing
 * the label and 404'ing through `/actors/:uid`.
 */
export async function GET(_request: Request, { params }: RouteParams) {
	try {
		const { uid } = await params;
		const entity = await holocron.entities.get(uid);
		return NextResponse.json(entity);
	} catch (error) {
		return handleError(error);
	}
}
