/**
 * Shared helpers for tool handlers.
 */
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { HolocronError, NotFoundError, ValidationError } from "@squat-collective/holocron-ts";

/**
 * Wrap a JSON-serializable payload as a successful MCP tool result.
 */
export function jsonResult(payload: unknown): CallToolResult {
	return {
		content: [
			{
				type: "text",
				text: typeof payload === "string" ? payload : JSON.stringify(payload, null, 2),
			},
		],
	};
}

/**
 * Wrap an error as an MCP tool error result with a helpful message.
 */
export function errorResult(operation: string, err: unknown): CallToolResult {
	const message = formatError(operation, err);
	return {
		isError: true,
		content: [{ type: "text", text: message }],
	};
}

function formatError(operation: string, err: unknown): string {
	if (err instanceof NotFoundError) {
		return `${operation}: not found (${err.resourceType ?? "entity"} ${err.resourceUid ?? ""}).`;
	}
	if (err instanceof ValidationError) {
		const details = err.details?.map((d) => `${d.loc.join(".")}: ${d.msg}`).join("; ");
		return `${operation}: validation error — ${details ?? err.message}`;
	}
	if (err instanceof HolocronError) {
		const code = err.statusCode ? ` (HTTP ${err.statusCode})` : "";
		return `${operation}: ${err.message}${code}`;
	}
	if (err instanceof Error) {
		return `${operation}: ${err.message}`;
	}
	return `${operation}: unknown error`;
}
