/**
 * Per-asset-type spec key sets — just the keys, used by the asset detail
 * dashboard to split `metadata` into "known spec" vs "custom metadata"
 * bricks. The full spec-editor UI has moved to ⌘K wizards, but we still
 * need the key list to bucket existing values correctly.
 */

export type AssetType = "dataset" | "report" | "process" | "system";

const SPEC_KEYS: Record<AssetType, string[]> = {
	report: ["tool", "format", "refresh_schedule", "audience"],
	dataset: ["storage", "format", "refresh_schedule", "row_count", "pii"],
	process: ["orchestrator", "schedule", "runtime", "language"],
	system: ["vendor", "type", "environment", "api_available"],
};

export function getSpecKeys(assetType: AssetType): string[] {
	return SPEC_KEYS[assetType] ?? [];
}
