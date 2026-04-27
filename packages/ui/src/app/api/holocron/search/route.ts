import { proxyText } from "@/lib/api-route";

/**
 * GET /api/holocron/search?q=<query>&limit=<n>
 *
 * Thin proxy to the Python API's /search endpoint. The SDK doesn't wrap
 * this yet — when it does, swap the raw fetch for `holocron.search.query()`.
 */
export async function GET(request: Request) {
	const { searchParams } = new URL(request.url);
	const q = searchParams.get("q") ?? "";
	const limit = searchParams.get("limit") ?? "50";
	return proxyText(
		`/api/v1/search?${new URLSearchParams({ q, limit })}`,
		"Search",
	);
}
