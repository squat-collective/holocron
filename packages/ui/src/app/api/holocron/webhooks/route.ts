import { NextResponse } from "next/server";
import { handleError, proxyJson } from "@/lib/api-route";
import { holocron } from "@/lib/holocron";

/**
 * GET /api/holocron/webhooks
 * List registered webhook subscribers (newest first). Query string is
 * passed through so the Python API owns the pagination contract.
 */
export async function GET(request: Request) {
	const { searchParams } = new URL(request.url);
	const qs = searchParams.toString();
	return proxyJson(`/api/v1/webhooks${qs ? `?${qs}` : ""}`);
}

/**
 * POST /api/holocron/webhooks
 * Register a new webhook. The HMAC `secret` in the response is the
 * one-and-only time the client can capture it — the API will not
 * surface it again.
 */
export async function POST(request: Request) {
	try {
		const body = await request.json();
		const webhook = await holocron.webhooks.create(body);
		return NextResponse.json(webhook, { status: 201 });
	} catch (error) {
		return handleError(error);
	}
}
