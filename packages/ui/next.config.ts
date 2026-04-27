import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	reactStrictMode: true,
	// Standalone output emits a self-contained server bundle with only
	// the deps that are actually traced — required for our slim prod image.
	output: "standalone",
	// In a monorepo the workspace root holds shared node_modules; without this
	// Next traces from packages/ui and misses workspace deps in the image.
	outputFileTracingRoot: path.join(__dirname, "../.."),
};

export default nextConfig;
