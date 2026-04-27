import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	test: {
		// happy-dom is lighter than jsdom and covers everything React Testing
		// Library needs when we add component tests later.
		environment: "happy-dom",
		include: ["src/**/*.{test,spec}.{ts,tsx}"],
		globals: true,
	},
});
