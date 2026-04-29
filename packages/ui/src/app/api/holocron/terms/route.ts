import { NextResponse } from "next/server";
import { handleError } from "@/lib/api-route";
import { holocron } from "@/lib/holocron";

/**
 * GET /api/holocron/terms?domain=...&status=...&pii=...
 * List glossary terms.
 */
export async function GET(request: Request) {
	try {
		const url = new URL(request.url);
		const domain = url.searchParams.get("domain") ?? undefined;
		const status = (url.searchParams.get("status") ?? undefined) as
			| "draft"
			| "approved"
			| "deprecated"
			| undefined;
		const piiParam = url.searchParams.get("pii");
		const pii = piiParam === null ? undefined : piiParam === "true";
		const data = await holocron.terms.list({ domain, status, pii });
		return NextResponse.json(data);
	} catch (error) {
		return handleError(error);
	}
}

/**
 * POST /api/holocron/terms
 * Create a glossary term.
 */
export async function POST(request: Request) {
	try {
		const body = await request.json();
		const term = await holocron.terms.create(body);
		return NextResponse.json(term, { status: 201 });
	} catch (error) {
		return handleError(error);
	}
}
