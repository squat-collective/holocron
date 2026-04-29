import { NextResponse } from "next/server";
import { handleError } from "@/lib/api-route";
import { holocron } from "@/lib/holocron";

interface RouteParams {
	params: Promise<{ uid: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
	try {
		const { uid } = await params;
		const term = await holocron.terms.get(uid);
		return NextResponse.json(term);
	} catch (error) {
		return handleError(error);
	}
}

export async function PUT(request: Request, { params }: RouteParams) {
	try {
		const { uid } = await params;
		const body = await request.json();
		const term = await holocron.terms.update(uid, body);
		return NextResponse.json(term);
	} catch (error) {
		return handleError(error);
	}
}

export async function DELETE(_request: Request, { params }: RouteParams) {
	try {
		const { uid } = await params;
		await holocron.terms.delete(uid);
		return new NextResponse(null, { status: 204 });
	} catch (error) {
		return handleError(error);
	}
}
