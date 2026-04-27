import { HolocronError } from "@squat-collective/holocron-ts";
import { NextResponse } from "next/server";

export const API_URL = process.env.HOLOCRON_API_URL ?? "http://holocron:8000";

export function handleError(error: unknown): NextResponse {
	if (error instanceof HolocronError) {
		return NextResponse.json(
			{ error: error.message, details: error.apiError },
			{ status: error.statusCode ?? 500 },
		);
	}
	console.error("Unexpected error:", error);
	return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

/**
 * JSON-in/JSON-out passthrough to the Python API. Forwards the upstream
 * status and body unchanged.
 */
export async function proxyJson(
	path: string,
	init?: RequestInit,
): Promise<NextResponse> {
	const upstream = await fetch(`${API_URL}${path}`, {
		cache: "no-store",
		...init,
	});
	const body = await upstream.json();
	return NextResponse.json(body, { status: upstream.status });
}

/**
 * Raw text passthrough to the Python API, preserving upstream Content-Type.
 * On network failure, returns a 502 with `{ error: "<label> unavailable" }`.
 */
export async function proxyText(
	path: string,
	errorLabel: string,
	init?: RequestInit,
): Promise<NextResponse> {
	try {
		const upstream = await fetch(`${API_URL}${path}`, {
			cache: "no-store",
			...init,
		});
		const body = await upstream.text();
		return new NextResponse(body, {
			status: upstream.status,
			headers: {
				"Content-Type":
					upstream.headers.get("Content-Type") ?? "application/json",
			},
		});
	} catch (error) {
		console.error(`${errorLabel} proxy error:`, error);
		return NextResponse.json(
			{ error: `${errorLabel} unavailable` },
			{ status: 502 },
		);
	}
}
