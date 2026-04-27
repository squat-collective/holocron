import type { NextConfig } from "next";

// Set to "/holocron" or "/holocron/v0.1.0" by the docs workflow when
// building for GitHub Pages. Empty in dev so localhost still works.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
	reactStrictMode: true,
	// Static export — produces `out/` for any plain static host (GH Pages).
	// `next dev` ignores this; `next start` won't work in export mode.
	output: "export",
	basePath,
	assetPrefix: basePath || undefined,
	images: { unoptimized: true },
	trailingSlash: true,
	// Allow reading repo-root docs/*.md via relative path at build time.
	outputFileTracingRoot: process.cwd() + "/../..",
};

export default nextConfig;
