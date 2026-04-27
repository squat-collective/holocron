import type { NextResponse } from "next/server";
import { API_URL, proxyJson } from "@/lib/api-route";

interface RouteParams {
	params: Promise<{ uid: string }>;
}

export async function GET(_request: Request, { params }: RouteParams): Promise<NextResponse> {
	const { uid } = await params;
	return proxyJson(`/api/v1/rules/${uid}`);
}

export async function PUT(request: Request, { params }: RouteParams): Promise<NextResponse> {
	const { uid } = await params;
	const body = await request.json();
	return proxyJson(`/api/v1/rules/${uid}`, {
		method: "PUT",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}

export async function DELETE(_request: Request, { params }: RouteParams): Promise<Response> {
	const { uid } = await params;
	const upstream = await fetch(`${API_URL}/api/v1/rules/${uid}`, { method: "DELETE" });
	if (upstream.status === 204) return new Response(null, { status: 204 });
	const body = await upstream.text();
	return new Response(body, { status: upstream.status });
}
