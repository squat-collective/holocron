import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	reactStrictMode: true,
	// Allow reading repo-root docs/*.md via relative path at build time.
	outputFileTracingRoot: process.cwd() + "/../..",
};

export default nextConfig;
