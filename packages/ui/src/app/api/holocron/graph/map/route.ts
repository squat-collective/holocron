import { proxyText } from "@/lib/api-route";

/**
 * GET /api/holocron/graph/map?lod=<0|1>
 *
 * Thin proxy to the Python API's /graph/map endpoint.
 */
export async function GET(request: Request) {
	const { searchParams } = new URL(request.url);
	const lod = searchParams.get("lod") ?? "1";
	return proxyText(
		`/api/v1/graph/map?${new URLSearchParams({ lod })}`,
		"Graph map",
	);
}
