import { proxyText } from "@/lib/api-route";

/**
 * GET /api/holocron/search?q=<query>&limit=<n>&kind=...&type=...
 *
 * Thin proxy to the Python API's /search endpoint.
 *
 * `kind` and `type` are repeatable: the wizards send the kinds and
 * types they accept for a step so the API can apply the filter
 * server-side (otherwise valid hits get squeezed out of the
 * globally-ranked top-N before the client-side filter ever runs).
 *
 * The SDK doesn't wrap this yet — when it does, swap the raw fetch for
 * `holocron.search.query()`.
 */
export async function GET(request: Request) {
	const { searchParams } = new URL(request.url);
	const q = searchParams.get("q") ?? "";
	const limit = searchParams.get("limit") ?? "50";
	// URLSearchParams here is built by hand so repeatable params keep
	// their multiplicity through the proxy. The constructor's object
	// form would coerce `kind=[a, b]` into a stringified array.
	const upstream = new URLSearchParams();
	upstream.set("q", q);
	upstream.set("limit", limit);
	for (const k of searchParams.getAll("kind")) upstream.append("kind", k);
	for (const t of searchParams.getAll("type")) upstream.append("type", t);
	return proxyText(`/api/v1/search?${upstream}`, "Search");
}
