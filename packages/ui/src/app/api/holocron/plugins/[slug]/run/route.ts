import { API_URL } from "@/lib/api-route";

/**
 * POST /api/holocron/plugins/[slug]/run
 * Forwards the multipart body to the API. Returns either JSON (import) or
 * streamed bytes (export) — content-type/content-disposition pass through.
 */
export async function POST(
	request: Request,
	context: { params: Promise<{ slug: string }> },
): Promise<Response> {
	const { slug } = await context.params;
	const formData = await request.formData();

	const upstream = await fetch(`${API_URL}/api/v1/plugins/${slug}/run`, {
		method: "POST",
		body: formData,
	});

	const headers = new Headers();
	const contentType = upstream.headers.get("content-type");
	const contentDisposition = upstream.headers.get("content-disposition");
	if (contentType) headers.set("content-type", contentType);
	if (contentDisposition) headers.set("content-disposition", contentDisposition);

	return new Response(upstream.body, { status: upstream.status, headers });
}
