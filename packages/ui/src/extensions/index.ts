/**
 * Extension framework — public surface.
 *
 * The built-in extensions are installed at client module-load time from
 * `host.tsx` (see the comment block there for why). This file is a pure
 * re-export barrel — importing it does not run any side effects.
 *
 * Adding a new built-in: drop a file under `extensions/built-in/` and add
 * its entry to the `BUILT_IN_EXTENSIONS` array in `host.tsx`. To contribute
 * an extension at runtime (e.g. from a backend plugin manifest), call
 * `registerExtension(...)` from a "use client" module.
 */

export { ExtensionHost } from "./host";
export { PluginsExtensionAdapter } from "./plugins-adapter";
export {
	registerExtension,
	getExtensions,
	computeCommands,
	clearExtensions,
} from "./registry";
export {
	useFocusedEntity,
	useSetFocusedEntity,
	setFocusedEntity,
	getFocusedEntity,
} from "./focused-entity";
export type {
	Extension,
	ExtensionCommand,
	ExtensionContext,
	FocusedEntity,
	FocusedEntityKind,
	FocusedAsset,
	FocusedActor,
} from "./types";
