"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, FolderPlus, FrownIcon, Plus, SearchX } from "lucide-react";
import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { getAssetTypeIcon, getContainerTypeIcon, PiiIcon, SchemaFieldIcon } from "@/lib/icons";
import { queryKeys } from "@/lib/query-keys";
import {
	insertSchemaChild,
	insertSchemaSibling,
	makeSchemaNodeId,
	type SchemaNode,
	updateSchemaNode,
} from "@/lib/schema-ops";
import { cn } from "@/lib/utils";
import { openConfirmWizard, openEditSchemaFieldWizard } from "@/lib/wizard-store";

/**
 * Vim-ish schema editor — navigate the tree with arrows, mutate with single
 * keystrokes:
 *
 *   ↑ ↓        move focus
 *   ← →        collapse / expand container
 *   n / N      new sibling field / container (after the focused row)
 *   a / A      new child field / container (containers only — auto-expands)
 *   r          rename in place
 *   d          delete (with confirm)
 *   p          toggle PII (fields only)
 *   t          open the type-pick wizard
 *   Esc        cancel inline input or clear focus
 *
 * The editor PUTs the full asset metadata on every mutation. That's the only
 * mutation surface the API exposes today; if we add a `/schema` endpoint
 * later this whole component swaps over without affecting callers.
 */

interface Asset {
	uid: string;
	type: "dataset" | "report" | "process" | "system";
	name: string;
	metadata: Record<string, unknown>;
}

interface Props {
	asset: Asset | undefined;
	isLoading: boolean;
	error: Error | null;
}

type InlineMode =
	| "rename"
	| "add-sibling-field"
	| "add-sibling-container"
	| "add-child-field"
	| "add-child-container";

interface InlineState {
	mode: InlineMode;
	/** For rename, the renamed node's path. For add-*, the anchor (parent or
	 *  sibling) path. For "add at root", an empty array. */
	anchorPath: string[];
	value: string;
}

/* ------------------------------------------------------------------ */

export function SchemaEditor({ asset, isLoading, error }: Props) {
	const queryClient = useQueryClient();

	const schema = (asset?.metadata.schema as SchemaNode[] | undefined) ?? [];
	// Track *collapsed* paths. Containers default to expanded — newly added
	// nodes appear open without us having to wire up an effect.
	const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
	const [focusedKey, setFocusedKey] = useState<string | null>(null);
	const [inline, setInline] = useState<InlineState | null>(null);
	const editorRef = useRef<HTMLDivElement | null>(null);

	// Pull focus back to the editor div so single-key shortcuts (n / a / r / d /…)
	// keep working after an inline input commits or unmounts. RAF lets the new
	// render commit first.
	const focusEditor = useCallback(() => {
		requestAnimationFrame(() => editorRef.current?.focus());
	}, []);

	// Autofocus the editor when the asset loads so the user can start typing
	// shortcuts immediately — no click required.
	useEffect(() => {
		if (!asset) return;
		focusEditor();
	}, [asset?.uid, focusEditor, asset]);

	// Visible rows = pre-order walk respecting `collapsed`. Computed every
	// render so it always reflects the latest schema.
	const visible = useMemo(() => visibleRows(schema, collapsed), [schema, collapsed]);

	// Keep focusedKey valid: if it points at a vanished node, snap to first.
	useEffect(() => {
		if (visible.length === 0) {
			if (focusedKey !== null) setFocusedKey(null);
			return;
		}
		if (!focusedKey || !visible.find((r) => r.key === focusedKey)) {
			setFocusedKey(visible[0]?.key ?? null);
		}
	}, [visible, focusedKey]);

	const focusedIdx = focusedKey ? visible.findIndex((r) => r.key === focusedKey) : -1;
	const focusedRow: VisibleRow | null = focusedIdx >= 0 ? (visible[focusedIdx] ?? null) : null;

	/* ----- Mutation: write the entire schema and refresh ------------ */
	const writeSchema = useCallback(
		async (nextSchema: SchemaNode[], successLabel: string) => {
			if (!asset) return false;
			try {
				const getRes = await fetch(`/api/holocron/assets/${asset.uid}`);
				if (!getRes.ok) throw new Error(`Fetch failed (${getRes.status})`);
				const fresh = (await getRes.json()) as {
					metadata: Record<string, unknown>;
				};
				const putRes = await fetch(`/api/holocron/assets/${asset.uid}`, {
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						metadata: { ...fresh.metadata, schema: nextSchema },
					}),
				});
				if (!putRes.ok) {
					const body = await putRes.text();
					throw new Error(body || `Save failed (${putRes.status})`);
				}
				queryClient.invalidateQueries({
					queryKey: queryKeys.assets.detail(asset.uid),
				});
				toast.success(successLabel);
				return true;
			} catch (err) {
				toast.error(err instanceof Error ? err.message : "Something went wrong");
				return false;
			}
		},
		[asset, queryClient],
	);

	/* ----- Inline edit commit / cancel ------------------------------ */
	const commitInline = useCallback(async () => {
		if (!inline || !asset) return;
		const trimmed = inline.value.trim();
		if (!trimmed) {
			setInline(null);
			return;
		}

		if (inline.mode === "rename") {
			const next = updateSchemaNode(schema, inline.anchorPath, (n) => ({
				...n,
				name: trimmed,
			}));
			const newKey = [...inline.anchorPath.slice(0, -1), trimmed].join("/");
			setInline(null);
			setFocusedKey(newKey);
			focusEditor();
			void writeSchema(next, "Renamed");
			return;
		}

		const isField = inline.mode.endsWith("field");
		const isChild = inline.mode.startsWith("add-child");
		const newNode: SchemaNode = isField
			? {
					id: makeSchemaNodeId(),
					name: trimmed,
					nodeType: "field",
					dataType: "string",
				}
			: {
					id: makeSchemaNodeId(),
					name: trimmed,
					nodeType: "container",
					children: [],
				};

		// Sibling: insert right after the focused row (insertSchemaSibling).
		// Child:   prepend so the new node lands where the inline input was
		//          showing — keeps the visual + keyboard flow consistent.
		let next: SchemaNode[];
		let parentPath: string[];
		if (isChild) {
			parentPath = inline.anchorPath;
			next = insertSchemaChild(schema, parentPath, newNode, "first");
			// Make sure the parent container is expanded so the new child shows.
			setCollapsed((s) => {
				if (!s.has(inline.anchorPath.join("/"))) return s;
				const c = new Set(s);
				c.delete(inline.anchorPath.join("/"));
				return c;
			});
		} else if (inline.anchorPath.length === 0) {
			parentPath = [];
			next = insertSchemaChild(schema, [], newNode, "last");
		} else {
			parentPath = inline.anchorPath.slice(0, -1);
			next = insertSchemaSibling(schema, inline.anchorPath, newNode);
		}

		const newPath = [...parentPath, trimmed];
		setFocusedKey(newPath.join("/"));
		setInline(null);
		focusEditor();
		void writeSchema(next, `Added ${isField ? "field" : "container"} “${trimmed}”`);
	}, [inline, asset, schema, writeSchema, focusEditor]);

	const cancelInline = useCallback(() => {
		setInline(null);
		focusEditor();
	}, [focusEditor]);

	/* ----- Commands triggered by keys ------------------------------- */
	const startRename = useCallback((row: VisibleRow) => {
		setInline({ mode: "rename", anchorPath: row.path, value: row.node.name });
	}, []);

	const startAdd = useCallback((mode: Exclude<InlineMode, "rename">, anchor: VisibleRow | null) => {
		// `anchor === null` means "at the asset root".
		if (mode.startsWith("add-child")) {
			if (!anchor || anchor.node.nodeType !== "container") return;
			setCollapsed((s) => {
				if (!s.has(anchor.path.join("/"))) return s;
				const c = new Set(s);
				c.delete(anchor.path.join("/"));
				return c;
			});
			setInline({ mode, anchorPath: anchor.path, value: "" });
			return;
		}
		// Sibling: anchor is the row to insert after; root if there's nothing
		// focused yet.
		if (!anchor) {
			setInline({ mode, anchorPath: [], value: "" });
			return;
		}
		setInline({ mode, anchorPath: anchor.path, value: "" });
	}, []);

	const togglePii = useCallback(
		(row: VisibleRow) => {
			if (row.node.nodeType !== "field") return;
			const next = updateSchemaNode(schema, row.path, (n) => ({
				...n,
				pii: !n.pii,
			}));
			void writeSchema(next, row.node.pii ? "Unmarked PII" : "Marked as PII");
		},
		[schema, writeSchema],
	);

	const removeRow = useCallback(
		async (row: VisibleRow) => {
			const ok = await openConfirmWizard({
				title: `Delete ${row.node.nodeType}`,
				entityLabel: row.path.join(" / "),
				description:
					row.node.nodeType === "container"
						? "Everything nested inside will be lost. This cannot be undone."
						: "This cannot be undone.",
			});
			if (!ok) {
				focusEditor();
				return;
			}
			const next = updateSchemaNode(schema, row.path, () => null);
			// Move focus to the previous visible row so the user keeps a sensible
			// position.
			const prev = visible[focusedIdx - 1];
			setFocusedKey(prev ? prev.key : null);
			focusEditor();
			void writeSchema(next, `Deleted ${row.path.join(" / ")}`);
		},
		[schema, visible, focusedIdx, writeSchema, focusEditor],
	);

	const editType = useCallback(
		async (row: VisibleRow) => {
			if (!asset) return;
			const isContainer = row.node.nodeType === "container";
			await openEditSchemaFieldWizard(
				{
					assetUid: asset.uid,
					assetName: asset.name,
					nodePath: row.path,
					nodeName: row.node.name,
					nodeKind: row.node.nodeType,
					spec: isContainer
						? {
								field: "containerType",
								currentValue: row.node.containerType ?? null,
								input: "select",
								options: [
									{ value: "sheet", label: "Sheet" },
									{ value: "table", label: "Table" },
									{ value: "page", label: "Page" },
									{ value: "section", label: "Section" },
									{ value: "view", label: "View" },
									{ value: "dashboard", label: "Dashboard" },
									{ value: "model", label: "Model" },
									{ value: "endpoint", label: "Endpoint" },
								],
							}
						: {
								field: "dataType",
								currentValue: row.node.dataType ?? null,
								input: "select",
								options: [
									{ value: "string", label: "string" },
									{ value: "int", label: "int" },
									{ value: "float", label: "float" },
									{ value: "bool", label: "bool" },
									{ value: "date", label: "date" },
									{ value: "timestamp", label: "timestamp" },
									{ value: "json", label: "json" },
									{ value: "uuid", label: "uuid" },
									{ value: "email", label: "email" },
								],
							},
				},
				{ focusOnOpen: true },
			);
			focusEditor();
		},
		[asset, focusEditor],
	);

	const editDescription = useCallback(
		async (row: VisibleRow) => {
			if (!asset) return;
			await openEditSchemaFieldWizard(
				{
					assetUid: asset.uid,
					assetName: asset.name,
					nodePath: row.path,
					nodeName: row.node.name,
					nodeKind: row.node.nodeType,
					spec: {
						field: "description",
						currentValue: row.node.description ?? null,
						input: "textarea",
					},
				},
				{ focusOnOpen: true },
			);
			focusEditor();
		},
		[asset, focusEditor],
	);

	/* ----- Editor-level keydown ------------------------------------- */
	const onEditorKey = (e: KeyboardEvent<HTMLDivElement>) => {
		if (inline) return; // inline input owns its own keys
		const row = focusedRow;

		switch (e.key) {
			case "ArrowDown":
			case "j": {
				e.preventDefault();
				const next = visible[Math.min(focusedIdx + 1, visible.length - 1)];
				if (next) setFocusedKey(next.key);
				return;
			}
			case "ArrowUp":
			case "k": {
				e.preventDefault();
				const prev = visible[Math.max(focusedIdx - 1, 0)];
				if (prev) setFocusedKey(prev.key);
				return;
			}
			case "ArrowRight":
			case "l": {
				if (!row || row.node.nodeType !== "container") return;
				e.preventDefault();
				const key = row.path.join("/");
				if (collapsed.has(key)) {
					setCollapsed((s) => {
						const c = new Set(s);
						c.delete(key);
						return c;
					});
				} else {
					// Already expanded → jump to the first child if any.
					const next = visible[focusedIdx + 1];
					if (next && next.path.length === row.path.length + 1) {
						setFocusedKey(next.key);
					}
				}
				return;
			}
			case "ArrowLeft":
			case "h": {
				if (!row) return;
				e.preventDefault();
				const key = row.path.join("/");
				if (row.node.nodeType === "container" && !collapsed.has(key)) {
					setCollapsed((s) => {
						const c = new Set(s);
						c.add(key);
						return c;
					});
				} else if (row.path.length > 1) {
					setFocusedKey(row.path.slice(0, -1).join("/"));
				}
				return;
			}
			case "n":
				e.preventDefault();
				startAdd("add-sibling-field", row);
				return;
			case "N":
				e.preventDefault();
				startAdd("add-sibling-container", row);
				return;
			case "a":
				if (!row || row.node.nodeType !== "container") return;
				e.preventDefault();
				startAdd("add-child-field", row);
				return;
			case "A":
				if (!row || row.node.nodeType !== "container") return;
				e.preventDefault();
				startAdd("add-child-container", row);
				return;
			case "r":
				if (!row) return;
				e.preventDefault();
				startRename(row);
				return;
			case "d":
				if (!row) return;
				e.preventDefault();
				removeRow(row);
				return;
			case "p":
				if (!row) return;
				e.preventDefault();
				togglePii(row);
				return;
			case "t":
				if (!row) return;
				e.preventDefault();
				editType(row);
				return;
			case "i":
				if (!row) return;
				e.preventDefault();
				editDescription(row);
				return;
			// Esc is intentionally NOT handled here. The page-level
			// useEscapeTo hook bounces back to the parent asset. Inline
			// inputs catch Esc themselves to cancel before it bubbles.
		}
	};

	/* ----- Render --------------------------------------------------- */

	if (isLoading) return <SchemaEditorSkeleton />;

	if (error) {
		return (
			<div className="text-center py-12">
				<FrownIcon className="mx-auto size-8 text-destructive mb-2" />
				<p className="text-lg text-destructive">{error.message}</p>
			</div>
		);
	}

	if (!asset) {
		return (
			<div className="text-center py-12">
				<SearchX className="mx-auto size-8 text-muted-foreground mb-2" />
				<p className="text-lg text-muted-foreground">Asset not found</p>
			</div>
		);
	}

	const AssetIcon = getAssetTypeIcon(asset.type);
	const isInlineAtRoot = inline !== null && inline.anchorPath.length === 0;

	return (
		<div className="flex-1 flex flex-col gap-3 min-h-0">
			<Card className="border-primary/20 shrink-0 !py-4">
				<CardHeader className="pb-3">
					<div className="flex items-start justify-between gap-4 flex-wrap">
						<div className="flex items-center gap-3 min-w-0">
							<AssetIcon className="size-8 text-primary shrink-0" />
							<div className="min-w-0">
								<CardTitle className="text-2xl font-bold truncate">Schema · {asset.name}</CardTitle>
								<p className="text-muted-foreground text-xs mt-1">
									Click a row, then use the keyboard. Hit{" "}
									<kbd className="px-1 py-0.5 rounded border bg-muted font-mono">?</kbd> for the
									full reference.
								</p>
							</div>
						</div>
					</div>
				</CardHeader>
				<CardContent className="pt-0">
					<HintRow />
				</CardContent>
			</Card>

			<Card
				className="flex-1 min-h-0 overflow-hidden flex flex-col"
				ref={editorRef as React.RefObject<HTMLDivElement>}
				tabIndex={0}
				onKeyDown={onEditorKey}
			>
				<CardContent className="flex-1 min-h-0 overflow-auto py-3">
					{visible.length === 0 && !inline && (
						<EmptyState onSeed={(mode) => startAdd(mode, null)} />
					)}

					{visible.map((row) => {
						const inlineRename =
							inline?.mode === "rename" && inline.anchorPath.join("/") === row.key;
						const inlineAfter =
							inline !== null &&
							inline.mode !== "rename" &&
							!inline.mode.startsWith("add-child") &&
							inline.anchorPath.join("/") === row.key;
						const inlineFirstChild =
							inline?.mode.startsWith("add-child") && inline.anchorPath.join("/") === row.key;
						return (
							<div key={row.key}>
								<Row
									row={row}
									focused={row.key === focusedKey}
									collapsed={row.node.nodeType === "container" ? collapsed.has(row.key) : false}
									renaming={inlineRename}
									renameValue={inline?.value ?? ""}
									onSetFocus={() => setFocusedKey(row.key)}
									onToggle={() => {
										if (row.node.nodeType !== "container") return;
										setCollapsed((s) => {
											const c = new Set(s);
											if (c.has(row.key)) c.delete(row.key);
											else c.add(row.key);
											return c;
										});
									}}
									onRenameChange={(v) => setInline((s) => (s ? { ...s, value: v } : s))}
									onRenameCommit={() => void commitInline()}
									onRenameCancel={cancelInline}
								/>

								{inlineFirstChild && (
									<InlineNewRow
										kind={inline?.mode === "add-child-container" ? "container" : "field"}
										depth={row.path.length + 1}
										value={inline?.value ?? ""}
										onChange={(v) => setInline((s) => (s ? { ...s, value: v } : s))}
										onCommit={() => void commitInline()}
										onCancel={cancelInline}
									/>
								)}

								{inlineAfter && (
									<InlineNewRow
										kind={inline?.mode === "add-sibling-container" ? "container" : "field"}
										depth={row.path.length}
										value={inline?.value ?? ""}
										onChange={(v) => setInline((s) => (s ? { ...s, value: v } : s))}
										onCommit={() => void commitInline()}
										onCancel={cancelInline}
									/>
								)}
							</div>
						);
					})}

					{isInlineAtRoot && inline && (
						<InlineNewRow
							kind={inline.mode === "add-sibling-container" ? "container" : "field"}
							depth={1}
							value={inline.value}
							onChange={(v) => setInline((s) => (s ? { ...s, value: v } : s))}
							onCommit={() => void commitInline()}
							onCancel={cancelInline}
						/>
					)}
				</CardContent>
			</Card>
		</div>
	);
}

/* ================================================================== */
/* Visible rows                                                        */
/* ================================================================== */

interface VisibleRow {
	node: SchemaNode;
	path: string[];
	key: string;
	depth: number;
}

function visibleRows(
	tree: SchemaNode[],
	collapsed: Set<string>,
	parentPath: string[] = [],
): VisibleRow[] {
	const out: VisibleRow[] = [];
	for (const node of tree) {
		const path = [...parentPath, node.name];
		const key = path.join("/");
		out.push({ node, path, key, depth: path.length });
		if (
			node.nodeType === "container" &&
			!collapsed.has(key) &&
			node.children &&
			node.children.length > 0
		) {
			out.push(...visibleRows(node.children, collapsed, path));
		}
	}
	return out;
}

/* ================================================================== */
/* Row                                                                 */
/* ================================================================== */

function Row({
	row,
	focused,
	collapsed,
	renaming,
	renameValue,
	onSetFocus,
	onToggle,
	onRenameChange,
	onRenameCommit,
	onRenameCancel,
}: {
	row: VisibleRow;
	focused: boolean;
	collapsed: boolean;
	renaming: boolean;
	renameValue: string;
	onSetFocus: () => void;
	onToggle: () => void;
	onRenameChange: (v: string) => void;
	onRenameCommit: () => void;
	onRenameCancel: () => void;
}) {
	const isContainer = row.node.nodeType === "container";
	const Icon = isContainer ? getContainerTypeIcon(row.node.containerType) : SchemaFieldIcon;

	const indent = (row.depth - 1) * 16;

	return (
		<div
			className={cn(
				"group flex items-center gap-2 py-1 px-2 rounded-md cursor-pointer text-sm",
				"transition-colors",
				focused ? "bg-primary/15 ring-1 ring-primary/30" : "hover:bg-muted/40",
			)}
			style={{ paddingLeft: 8 + indent }}
			onClick={onSetFocus}
			onDoubleClick={(e) => {
				if (isContainer) {
					e.stopPropagation();
					onToggle();
				}
			}}
		>
			{isContainer ? (
				<button
					type="button"
					tabIndex={-1}
					onClick={(e) => {
						e.stopPropagation();
						onToggle();
					}}
					className="text-muted-foreground hover:text-foreground"
					aria-label={collapsed ? "Expand" : "Collapse"}
				>
					{collapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
				</button>
			) : (
				<span className="w-3.5" />
			)}
			<Icon className={cn(isContainer ? "size-4" : "size-3", "text-muted-foreground shrink-0")} />
			{renaming ? (
				<RenameInput
					value={renameValue}
					onChange={onRenameChange}
					onCommit={onRenameCommit}
					onCancel={onRenameCancel}
				/>
			) : (
				<>
					<span className="font-medium truncate">{row.node.name}</span>
					<span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
						{isContainer ? (row.node.containerType ?? "container") : (row.node.dataType ?? "field")}
					</span>
					{!isContainer && row.node.pii && (
						<span className="text-[10px] bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200 px-1.5 py-0.5 rounded flex items-center gap-0.5">
							<PiiIcon className="size-2.5" /> PII
						</span>
					)}
					{row.node.description && (
						<span className="text-xs text-muted-foreground truncate italic">
							— {row.node.description}
						</span>
					)}
				</>
			)}
		</div>
	);
}

/* ================================================================== */
/* Inline inputs                                                        */
/* ================================================================== */

function RenameInput({
	value,
	onChange,
	onCommit,
	onCancel,
}: {
	value: string;
	onChange: (v: string) => void;
	onCommit: () => void;
	onCancel: () => void;
}) {
	const ref = useRef<HTMLInputElement | null>(null);
	useEffect(() => {
		const raf = requestAnimationFrame(() => {
			ref.current?.focus();
			ref.current?.select();
		});
		return () => cancelAnimationFrame(raf);
	}, []);
	return (
		<Input
			ref={ref}
			value={value}
			onClick={(e) => e.stopPropagation()}
			onChange={(e) => onChange(e.target.value)}
			onBlur={onCancel}
			onKeyDown={(e) => {
				if (e.key === "Enter") {
					e.preventDefault();
					e.stopPropagation();
					onCommit();
				} else if (e.key === "Escape") {
					e.preventDefault();
					e.stopPropagation();
					onCancel();
				}
			}}
			className="h-7 text-sm flex-1"
		/>
	);
}

function InlineNewRow({
	kind,
	depth,
	value,
	onChange,
	onCommit,
	onCancel,
}: {
	kind: "field" | "container";
	depth: number;
	value: string;
	onChange: (v: string) => void;
	onCommit: () => void;
	onCancel: () => void;
}) {
	const ref = useRef<HTMLInputElement | null>(null);
	useEffect(() => {
		const raf = requestAnimationFrame(() => ref.current?.focus());
		return () => cancelAnimationFrame(raf);
	}, []);
	const Icon = kind === "container" ? FolderPlus : Plus;
	const indent = (depth - 1) * 16;
	return (
		<div
			className="flex items-center gap-2 py-1 px-2 rounded-md bg-primary/5 ring-1 ring-primary/40"
			style={{ paddingLeft: 8 + indent }}
		>
			<span className="w-3.5" />
			<Icon className="size-3.5 text-primary shrink-0" />
			<Input
				ref={ref}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				onBlur={onCancel}
				onClick={(e) => e.stopPropagation()}
				onKeyDown={(e) => {
					if (e.key === "Enter") {
						e.preventDefault();
						e.stopPropagation();
						onCommit();
					} else if (e.key === "Escape") {
						e.preventDefault();
						e.stopPropagation();
						onCancel();
					}
				}}
				placeholder={kind === "container" ? "container name…" : "field name…"}
				className="h-7 text-sm flex-1"
			/>
		</div>
	);
}

/* ================================================================== */
/* Empty + hints                                                       */
/* ================================================================== */

function EmptyState({
	onSeed,
}: {
	onSeed: (mode: "add-sibling-field" | "add-sibling-container") => void;
}) {
	return (
		<div className="text-center py-10 space-y-3 text-sm">
			<p className="text-muted-foreground">
				No schema yet. Press <kbd className="px-1 py-0.5 rounded border bg-muted font-mono">N</kbd>{" "}
				to add a container, or{" "}
				<kbd className="px-1 py-0.5 rounded border bg-muted font-mono">n</kbd> for a field.
			</p>
			<div className="flex justify-center gap-2">
				<button
					type="button"
					onClick={() => onSeed("add-sibling-container")}
					className="text-xs px-2 py-1 rounded border border-primary/20 hover:bg-muted/40"
				>
					+ Container
				</button>
				<button
					type="button"
					onClick={() => onSeed("add-sibling-field")}
					className="text-xs px-2 py-1 rounded border border-primary/20 hover:bg-muted/40"
				>
					+ Field
				</button>
			</div>
		</div>
	);
}

function HintRow() {
	return (
		<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground/80">
			<KeyHint k="↑↓">move</KeyHint>
			<KeyHint k="←→">collapse / expand</KeyHint>
			<KeyHint k="n">new sibling field</KeyHint>
			<KeyHint k="N">new sibling container</KeyHint>
			<KeyHint k="a">add child field</KeyHint>
			<KeyHint k="A">add child container</KeyHint>
			<KeyHint k="r">rename</KeyHint>
			<KeyHint k="d">delete</KeyHint>
			<KeyHint k="p">PII toggle</KeyHint>
			<KeyHint k="t">type</KeyHint>
			<KeyHint k="i">describe</KeyHint>
			<KeyHint k="Esc">back to asset</KeyHint>
		</div>
	);
}

function KeyHint({ k, children }: { k: string; children: React.ReactNode }) {
	return (
		<span className="inline-flex items-center gap-1">
			<kbd className="inline-flex items-center justify-center min-w-[1.2rem] rounded border border-primary/20 bg-muted/40 px-1.5 py-0.5 text-[10px] font-mono">
				{k}
			</kbd>
			<span>{children}</span>
		</span>
	);
}

function SchemaEditorSkeleton() {
	return (
		<div className="space-y-3">
			<Skeleton className="h-16 w-full" />
			<Skeleton className="h-72 w-full" />
		</div>
	);
}
