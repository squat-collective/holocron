import type { NextResponse } from "next/server";
import { proxyJson } from "@/lib/api-route";

/**
 * GET /api/holocron/plugins
 * Returns all registered plugin manifests for UI auto-discovery.
 */
export async function GET(): Promise<NextResponse> {
	return proxyJson("/api/v1/plugins");
}
