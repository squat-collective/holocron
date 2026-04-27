"use client";

import { ExternalLink, FileDown, Play, Sparkles } from "lucide-react";
import { type FormEvent, useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import {
	Kbd,
	useWizardAutoFocus,
	WizardFocusProvider,
} from "@/components/features/wizard-shared";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	filenameFromContentDisposition,
	type PluginInputSpec,
	type PluginManifest,
	type PluginSummaryResult,
} from "@/lib/plugins";
import {
	closeWizard,
	type PluginRunParams,
	type PluginRunResult,
} from "@/lib/wizard-store";

/**
 * Plugin run wizard.
 *
 * Auto-renders a form from the plugin's manifest, posts multipart to the
 * UI proxy at `/api/holocron/plugins/{slug}/run`, and handles either of
 * the two response shapes the API uses:
 *
 *  - **IMPORT** plugins return JSON (`SummaryResult`) — the wizard switches
 *    to a summary view with stat counts and sample rows, plus a "Review"
 *    link if the manifest provides one.
 *  - **EXPORT** plugins stream binary bytes — the wizard kicks off a
 *    browser download from the response blob and resolves immediately.
 *
 * Validation lives entirely on the server (the manifest is the contract).
 * The wizard's only client-side check is that required inputs aren't empty
 * — anything more would duplicate logic that the API already enforces.
 */

interface Frame {
	id: string;
	kind: "plugin-run";
	params: PluginRunParams;
	resolve: (result: PluginRunResult | null) => void;
}

type Phase =
	| { state: "form" }
	| { state: "running" }
	| { state: "summary"; result: PluginSummaryResult }
	| { state: "error"; message: string };

export function PluginRunWizard({
	frame,
	isTop,
	isNested,
}: {
	frame: Frame;
	isTop: boolean;
	isNested: boolean;
}) {
	return (
		<WizardFocusProvider initialInteracted={isNested}>
			<Flow frame={frame} isTop={isTop} />
		</WizardFocusProvider>
	);
}

function Flow({ frame, isTop }: { frame: Frame; isTop: boolean }) {
	const { manifest } = frame.params;
	const [open, setOpen] = useState(true);
	const [phase, setPhase] = useState<Phase>({ state: "form" });
	const [values, setValues] = useState<Record<string, string | boolean | File | null>>(
		() => initialValues(manifest),
	);

	const firstInputRef = useRef<HTMLInputElement | null>(null);
	useWizardAutoFocus(firstInputRef);

	const inputs = manifest.inputs ?? [];
	const missingRequired = inputs.some((spec) => {
		if (!spec.required) return false;
		const v = values[spec.name];
		if (spec.type === "file") return !(v instanceof File);
		if (spec.type === "boolean") return false; // boolean required = must be true? not currently meaningful
		return typeof v !== "string" || v.trim() === "";
	});

	const close = useCallback(
		(result: PluginRunResult | null) => {
			setOpen(false);
			closeWizard(frame.id, result);
		},
		[frame.id],
	);

	const submit = useCallback(
		async (e?: FormEvent) => {
			e?.preventDefault();
			if (missingRequired || phase.state === "running") return;
			setPhase({ state: "running" });

			const formData = new FormData();
			for (const spec of inputs) {
				const v = values[spec.name];
				if (v instanceof File) formData.append(spec.name, v, v.name);
				else if (typeof v === "boolean") formData.append(spec.name, v ? "true" : "false");
				else if (typeof v === "string" && v.length > 0) formData.append(spec.name, v);
			}

			try {
				const res = await fetch(
					`/api/holocron/plugins/${encodeURIComponent(manifest.slug)}/run`,
					{ method: "POST", body: formData },
				);
				if (!res.ok) {
					const text = await safeReadText(res);
					throw new Error(text || `Plugin failed (${res.status})`);
				}

				const contentType = res.headers.get("content-type") ?? "";
				if (contentType.includes("application/json")) {
					const result = (await res.json()) as PluginSummaryResult;
					setPhase({ state: "summary", result });
					toast.success(result.title || `${manifest.name} finished`);
				} else {
					// EXPORT path: stream the blob into a download.
					const blob = await res.blob();
					const filename = filenameFromContentDisposition(
						res.headers.get("content-disposition"),
						`${manifest.slug}.bin`,
					);
					triggerDownload(blob, filename);
					toast.success(`${manifest.name} downloaded`);
					close({ ok: true });
				}
			} catch (err) {
				const message = err instanceof Error ? err.message : "Something went wrong";
				setPhase({ state: "error", message });
				toast.error(message);
			}
		},
		[missingRequired, phase.state, inputs, values, manifest.slug, manifest.name, close],
	);

	const handleEnter = (e: React.KeyboardEvent<HTMLDivElement>) => {
		if (!isTop) return;
		if (phase.state !== "form") return;
		if (e.key !== "Enter") return;
		// Plain Enter on a textarea or file input would be wrong; require modifier.
		if (!(e.metaKey || e.ctrlKey)) return;
		e.preventDefault();
		void submit();
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next) close(null);
			}}
		>
			<DialogContent
				className="sm:max-w-xl bg-card/90 backdrop-blur-xl border-primary/20"
				onKeyDown={handleEnter}
				onOpenAutoFocus={(e) => e.preventDefault()}
			>
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2 text-base">
						<span className="text-xl leading-none">{manifest.icon || "🧩"}</span>
						<span>{manifest.name}</span>
						<span className="text-xs font-normal text-muted-foreground ml-auto">
							{capabilityLabel(manifest.capability)} · v{manifest.version}
						</span>
					</DialogTitle>
					<DialogDescription className="text-xs leading-relaxed">
						{manifest.description}
					</DialogDescription>
				</DialogHeader>

				{phase.state === "form" || phase.state === "running" ? (
					<form className="space-y-4" onSubmit={submit}>
						{inputs.length === 0 ? (
							<p className="text-sm text-muted-foreground">
								No inputs — press Run to start.
							</p>
						) : (
							inputs.map((spec, i) => (
								<InputField
									key={spec.name}
									spec={spec}
									value={values[spec.name] ?? null}
									onChange={(v) =>
										setValues((prev) => ({ ...prev, [spec.name]: v }))
									}
									inputRef={i === 0 ? firstInputRef : null}
								/>
							))
						)}

						<div className="text-[11px] text-muted-foreground/70 flex items-center gap-2">
							<Kbd>⌘↵</Kbd> run
						</div>

						<DialogFooter className="sm:justify-between gap-2 pt-1">
							<Button
								type="button"
								variant="ghost"
								onClick={() => close(null)}
								disabled={phase.state === "running"}
							>
								Cancel
							</Button>
							<Button
								type="submit"
								disabled={missingRequired || phase.state === "running"}
							>
								{manifest.capability === "export" ? <FileDown /> : <Play />}
								{phase.state === "running"
									? "Running…"
									: manifest.capability === "export"
										? "Download"
										: "Run"}
							</Button>
						</DialogFooter>
					</form>
				) : phase.state === "summary" ? (
					<SummaryView
						manifest={manifest}
						result={phase.result}
						onClose={() => close({ ok: true })}
					/>
				) : (
					<ErrorView
						message={phase.message}
						onRetry={() => setPhase({ state: "form" })}
						onClose={() => close(null)}
					/>
				)}
			</DialogContent>
		</Dialog>
	);
}

/* ------------------------------------------------------------------ */
/* Input renderer — one component per InputType                        */
/* ------------------------------------------------------------------ */

function InputField({
	spec,
	value,
	onChange,
	inputRef,
}: {
	spec: PluginInputSpec;
	value: string | boolean | File | null;
	onChange: (v: string | boolean | File | null) => void;
	inputRef: React.MutableRefObject<HTMLInputElement | null> | null;
}) {
	const inputId = `plugin-input-${spec.name}`;

	if (spec.type === "boolean") {
		return (
			<div className="flex items-start gap-2">
				<Checkbox
					id={inputId}
					checked={value === true}
					onCheckedChange={(checked) => onChange(checked === true)}
					className="mt-0.5"
				/>
				<div className="space-y-0.5">
					<Label htmlFor={inputId} className="text-sm font-normal leading-snug">
						{spec.label}
						{spec.required && <span className="text-destructive ml-0.5">*</span>}
					</Label>
					{spec.description && (
						<p className="text-xs text-muted-foreground">{spec.description}</p>
					)}
				</div>
			</div>
		);
	}

	if (spec.type === "file") {
		return (
			<div className="space-y-1.5">
				<Label htmlFor={inputId} className="text-sm">
					{spec.label}
					{spec.required && <span className="text-destructive ml-0.5">*</span>}
				</Label>
				<Input
					ref={inputRef}
					id={inputId}
					type="file"
					accept={spec.accept ?? undefined}
					onChange={(e) => onChange(e.target.files?.[0] ?? null)}
					className="h-11 cursor-pointer file:cursor-pointer file:text-sm"
				/>
				{spec.description && (
					<p className="text-xs text-muted-foreground">{spec.description}</p>
				)}
			</div>
		);
	}

	// string
	return (
		<div className="space-y-1.5">
			<Label htmlFor={inputId} className="text-sm">
				{spec.label}
				{spec.required && <span className="text-destructive ml-0.5">*</span>}
			</Label>
			<Input
				ref={inputRef}
				id={inputId}
				type="text"
				value={typeof value === "string" ? value : ""}
				onChange={(e) => onChange(e.target.value)}
				className="h-11"
			/>
			{spec.description && (
				<p className="text-xs text-muted-foreground">{spec.description}</p>
			)}
		</div>
	);
}

/* ------------------------------------------------------------------ */
/* Summary view (IMPORT result)                                         */
/* ------------------------------------------------------------------ */

function SummaryView({
	manifest,
	result,
	onClose,
}: {
	manifest: PluginManifest;
	result: PluginSummaryResult;
	onClose: () => void;
}) {
	const counts = Object.entries(result.counts ?? {});
	const samples = result.samples ?? [];
	return (
		<div className="space-y-4">
			<div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
				<div className="flex items-center gap-2 text-sm">
					<Sparkles className="size-4 text-primary" />
					<span className="font-medium">{result.title}</span>
				</div>
			</div>

			{counts.length > 0 && (
				<div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
					{counts.map(([key, value]) => (
						<div key={key} className="rounded-md border bg-card p-2">
							<dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
								{key.replace(/_/g, " ")}
							</dt>
							<dd className="text-base font-semibold mt-0.5">{value}</dd>
						</div>
					))}
				</div>
			)}

			{samples.length > 0 && (
				<div className="space-y-1">
					<p className="text-xs font-medium text-muted-foreground">
						Sample{samples.length === 1 ? "" : "s"}
					</p>
					<ul className="space-y-1 text-sm">
						{samples.slice(0, 5).map((sample, i) => (
							<li
								key={i}
								className="rounded border bg-muted/40 px-2 py-1.5 font-mono text-xs"
							>
								{summariseSample(sample)}
							</li>
						))}
					</ul>
				</div>
			)}

			<DialogFooter className="sm:justify-between gap-2">
				{manifest.review_link ? (
					<Button asChild variant="outline">
						<a href={manifest.review_link}>
							Review <ExternalLink className="size-3.5" />
						</a>
					</Button>
				) : (
					<span />
				)}
				<Button onClick={onClose}>Done</Button>
			</DialogFooter>
		</div>
	);
}

function ErrorView({
	message,
	onRetry,
	onClose,
}: {
	message: string;
	onRetry: () => void;
	onClose: () => void;
}) {
	return (
		<div className="space-y-4">
			<div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
				<p className="text-sm text-destructive">{message}</p>
			</div>
			<DialogFooter className="sm:justify-between gap-2">
				<Button variant="ghost" onClick={onClose}>
					Cancel
				</Button>
				<Button onClick={onRetry}>Retry</Button>
			</DialogFooter>
		</div>
	);
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function initialValues(
	manifest: PluginManifest,
): Record<string, string | boolean | File | null> {
	const out: Record<string, string | boolean | File | null> = {};
	for (const spec of manifest.inputs ?? []) {
		if (spec.type === "boolean") out[spec.name] = spec.default === true;
		else if (spec.type === "string")
			out[spec.name] = typeof spec.default === "string" ? spec.default : "";
		else out[spec.name] = null;
	}
	return out;
}

function capabilityLabel(c: PluginManifest["capability"]): string {
	return c === "import" ? "Import" : "Export";
}

async function safeReadText(res: Response): Promise<string> {
	try {
		return await res.text();
	} catch {
		return "";
	}
}

function triggerDownload(blob: Blob, filename: string) {
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	// Defer revoke so the click has time to start the download.
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function summariseSample(sample: Record<string, unknown>): string {
	const keysToTry = ["name", "title", "uid", "id"];
	for (const key of keysToTry) {
		const v = sample[key];
		if (typeof v === "string" && v.length > 0) return v;
	}
	// Fallback: short JSON stringification.
	const s = JSON.stringify(sample);
	return s.length > 120 ? `${s.slice(0, 120)}…` : s;
}
