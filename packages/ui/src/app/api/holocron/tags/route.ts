import { proxyJson } from "@/lib/api-route";

/**
 * GET /api/holocron/tags
 * List every distinct tag currently in use across assets, with counts.
 */
export async function GET() {
	return proxyJson("/api/v1/tags");
}
