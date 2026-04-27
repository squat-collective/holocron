import { NextResponse } from "next/server";
import { buildSearchIndex } from "@/lib/search-index";

// Force build-time generation (so the JSON is static and cacheable)
export const dynamic = "force-static";
export const revalidate = false;

export async function GET() {
	const entries = await buildSearchIndex();
	return NextResponse.json(entries, {
		headers: { "Cache-Control": "public, max-age=3600, immutable" },
	});
}
