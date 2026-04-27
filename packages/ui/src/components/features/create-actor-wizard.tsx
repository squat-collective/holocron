"use client";

import {
	type KeyboardEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useDebounce } from "@/hooks/use-debounce";
import { useQueryClient } from "@tanstack/react-query";
import {
	ArrowLeft,
	Check,
	Sparkles,
	User,
	UserPlus,
	Users,
	X,
} from "lucide-react";
import { toast } from "sonner";
import {
	Kbd,
	Stepper,
	useWizardAutoFocus,
	useWizardFocus,
	WizardFocusProvider,
} from "@/components/features/wizard-shared";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getActorTypeIcon, type LucideIcon } from "@/lib/icons";
import { queryKeys } from "@/lib/query-keys";
import {
	type ActorCreateResult,
	type ActorType,
	closeWizard,
	openCreateActorWizard,
} from "@/lib/wizard-store";
import { cn } from "@/lib/utils";

interface Frame {
	id: string;
	kind: "actor-create";
	params: {
		prefillName?: string;
		prefillType?: ActorType;
	};
	resolve: (result: ActorCreateResult | null) => void;
}

/** Member of a team — already-existing person by uid. */
interface MemberRef {
	uid: string;
	name: string;
}

interface ActorData {
	type: ActorType | null;
	name: string;
	email: string;
	description: string;
	/** For teams only: persons that are members of this group. */
	members: MemberRef[];
}

type ActorStepId =
	| "type"
	| "name"
	| "email"
	| "description"
	| "members"
	| "review";
const ALL_STEPS: ActorStepId[] = [
	"type",
	"name",
	"email",
	"description",
	"members",
	"review",
];

/**
 * Step-by-step wizard for creating a person or team. One question per step.
 * Any step whose value is already provided via the frame's prefill params is
 * dropped from the flow, so invoking the wizard from a picker that already
 * knows name + type lands the user directly on the first blank question.
 */
export function CreateActorWizard({
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
			<ActorFlow frame={frame} isTop={isTop} />
		</WizardFocusProvider>
	);
}

function ActorFlow({ frame, isTop }: { frame: Frame; isTop: boolean }) {
	const { hasInteracted, markInteracted } = useWizardFocus();
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(true);
	const [submitting, setSubmitting] = useState(false);

	const [data, setData] = useState<ActorData>({
		type: frame.params.prefillType ?? null,
		name: frame.params.prefillName ?? "",
		email: "",
		description: "",
		members: [],
	});

	// Dynamic step list — drop any step whose answer is already baked in, and
	// hide the "members" step for anything other than a team.
	const steps = useMemo<ActorStepId[]>(() => {
		return ALL_STEPS.filter((s) => {
			if (s === "type" && frame.params.prefillType) return false;
			if (s === "name" && frame.params.prefillName) return false;
			if (s === "members" && data.type !== "group") return false;
			return true;
		});
	}, [frame.params.prefillType, frame.params.prefillName, data.type]);

	const [stepIndex, setStepIndex] = useState(0);
	const step: ActorStepId = steps[stepIndex] ?? "review";
	const isLastStep = stepIndex === steps.length - 1;

	const submitRef = useRef<HTMLButtonElement | null>(null);


	const canAdvance = (() => {
		switch (step) {
			case "type":
				return data.type !== null;
			case "name":
				return data.name.trim().length > 0;
			case "email":
			case "description":
			case "members":
				return true;
			case "review":
				return !submitting && data.type !== null && data.name.trim().length > 0;
		}
	})();

	const canSkip =
		step === "email" || step === "description" || step === "members";

	const next = useCallback(() => {
		markInteracted();
		setStepIndex((i) => Math.min(i + 1, steps.length - 1));
	}, [steps.length, markInteracted]);
	const back = useCallback(() => {
		markInteracted();
		setStepIndex((i) => Math.max(i - 1, 0));
	}, [markInteracted]);

	// The Create button lives in the footer (not under key={step}), so it
	// doesn't remount on step change — focus it imperatively when the review
	// step becomes current (and only if the user has interacted).
	useEffect(() => {
		if (!hasInteracted || !isLastStep || submitting) return;
		const t = setTimeout(() => submitRef.current?.focus(), 40);
		return () => clearTimeout(t);
	}, [hasInteracted, isLastStep, submitting]);

	const cancel = () => {
		setOpen(false);
		closeWizard(frame.id, null);
	};

	const submit = useCallback(async () => {
		if (!data.type || !data.name.trim()) return;
		setSubmitting(true);
		try {
			const res = await fetch("/api/holocron/actors", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					type: data.type,
					name: data.name.trim(),
					email: data.email.trim() || null,
					description: data.description.trim() || null,
				}),
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => null)) as
					| { error?: string }
					| null;
				throw new Error(body?.error ?? "Failed to create actor");
			}
			const created: ActorCreateResult = await res.json();

			// For teams, link each member via a member_of relation.
			if (data.type === "group" && data.members.length > 0) {
				for (const member of data.members) {
					const relRes = await fetch("/api/holocron/relations", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							from_uid: member.uid,
							to_uid: created.uid,
							type: "member_of",
							verified: true,
						}),
					});
					if (!relRes.ok) {
						console.warn(`member_of failed for ${member.name}`);
					}
				}
			}

			queryClient.invalidateQueries({ queryKey: queryKeys.actors.all });
			queryClient.invalidateQueries({ queryKey: queryKeys.relations.all });
			queryClient.invalidateQueries({ queryKey: ["catalog-search"] });
			toast.success(
				`Created ${data.type === "person" ? "" : "team "}“${created.name}”`,
			);
			setOpen(false);
			closeWizard(frame.id, created);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Something went wrong");
			setSubmitting(false);
		}
	}, [data, queryClient, frame.id]);

	const handleDialogKey = (event: KeyboardEvent<HTMLDivElement>) => {
		if (!isTop) return;
		if (!(event.metaKey || event.ctrlKey)) return;
		if (event.key === "ArrowRight" || event.key === "Enter") {
			event.preventDefault();
			if (!canAdvance || submitting) return;
			if (isLastStep) submit();
			else next();
			return;
		}
		if (event.key === "ArrowLeft") {
			event.preventDefault();
			if (stepIndex === 0 || submitting) return;
			back();
		}
	};

	const handleOpenChange = (nextOpen: boolean) => {
		if (!nextOpen) cancel();
	};

	const title =
		data.type === "group"
			? "New team"
			: data.type === "person"
				? "New person"
				: "New actor";

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent
				className="sm:max-w-md bg-card/90 backdrop-blur-xl border-primary/20"
				onKeyDown={handleDialogKey}
				onOpenAutoFocus={(event) => {
					// Focus is managed by useWizardAutoFocus hooks inside the tree.
					event.preventDefault();
				}}
			>
				<div className="contents">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2 text-base font-medium text-muted-foreground">
						<Sparkles className="size-4 text-primary" />
						{title}
					</DialogTitle>
					<DialogDescription className="sr-only">
						Step {stepIndex + 1} of {steps.length}
					</DialogDescription>
				</DialogHeader>

				<Stepper current={stepIndex} total={steps.length} />

				<div
					key={step}
					className="min-h-[180px] animate-in fade-in-0 slide-in-from-bottom-1 duration-300"
				>
					{step === "type" && (
						<StepType
							value={data.type}
							onCommit={(t) => {
								setData((d) => ({ ...d, type: t }));
								setTimeout(next, 90);
							}}
						/>
					)}
					{step === "name" && (
						<StepName
							typeLabel={data.type === "group" ? "team" : "person"}
							value={data.name}
							onChange={(v) => setData((d) => ({ ...d, name: v }))}
							onEnter={() => canAdvance && next()}
						/>
					)}
					{step === "email" && (
						<StepEmail
							typeLabel={data.type === "group" ? "team" : "person"}
							value={data.email}
							onChange={(v) => setData((d) => ({ ...d, email: v }))}
							onEnter={() => next()}
						/>
					)}
					{step === "description" && (
						<StepDescription
							value={data.description}
							onChange={(v) => setData((d) => ({ ...d, description: v }))}
						/>
					)}
					{step === "members" && (
						<StepMembers
							teamName={data.name.trim() || "this team"}
							value={data.members}
							onChange={(v) => setData((d) => ({ ...d, members: v }))}
						/>
					)}
					{step === "review" && <StepReview data={data} />}
				</div>

				<HintStrip step={step} canBack={stepIndex > 0} />

				<DialogFooter className="sm:justify-between gap-2 pt-2">
					<Button
						type="button"
						variant="ghost"
						onClick={stepIndex === 0 ? cancel : back}
						disabled={submitting}
					>
						{stepIndex === 0 ? (
							"Cancel"
						) : (
							<>
								<ArrowLeft className="size-4" />
								Back
							</>
						)}
					</Button>
					<div className="flex gap-2 ml-auto">
						{canSkip && !isLastStep && (
							<Button
								type="button"
								variant="outline"
								onClick={next}
								disabled={submitting}
							>
								Skip
							</Button>
						)}
						{isLastStep ? (
							<Button
								ref={submitRef}
								type="button"
								onClick={submit}
								disabled={!canAdvance || submitting}
							>
								<Check className="size-4" />
								{submitting ? "Creating…" : "Create"}
							</Button>
						) : (
							<Button type="button" onClick={next} disabled={!canAdvance}>
								Next
							</Button>
						)}
					</div>
				</DialogFooter>
				</div>
			</DialogContent>
		</Dialog>
	);
}

/* ---------- Step components ---------- */

interface TypeOption {
	value: ActorType;
	label: string;
	hint: string;
	icon: LucideIcon;
}

const TYPE_OPTIONS: TypeOption[] = [
	{
		value: "person",
		label: "Person",
		hint: "An individual — Alice, Bob, a contractor",
		icon: User,
	},
	{
		value: "group",
		label: "Team",
		hint: "A group of people — Data Team, Finance, oncall",
		icon: Users,
	},
];

function StepType({
	value,
	onCommit,
}: {
	value: ActorType | null;
	onCommit: (v: ActorType) => void;
}) {
	const initialCursor = Math.max(
		0,
		TYPE_OPTIONS.findIndex((o) => o.value === value),
	);
	const [cursor, setCursor] = useState(initialCursor);
	const buttonsRef = useRef<(HTMLButtonElement | null)[]>([]);
	const initialCardRef = useRef<HTMLButtonElement | null>(null);
	useWizardAutoFocus(initialCardRef);

	// Focus follows the cursor only after a user-driven change (arrow nav).
	const cursorMountedRef = useRef(false);
	useEffect(() => {
		if (!cursorMountedRef.current) {
			cursorMountedRef.current = true;
			return;
		}
		buttonsRef.current[cursor]?.focus();
	}, [cursor]);

	const handleKey = (e: KeyboardEvent<HTMLButtonElement>, idx: number) => {
		if (e.metaKey || e.ctrlKey) return;
		// Two-column grid with no wrap (same feel as asset type step).
		const COLS = 2;
		const TOTAL = TYPE_OPTIONS.length;
		const col = idx % COLS;
		let nextIdx: number | null = null;
		switch (e.key) {
			case "ArrowRight":
				if (col < COLS - 1 && idx + 1 < TOTAL) nextIdx = idx + 1;
				break;
			case "ArrowLeft":
				if (col > 0) nextIdx = idx - 1;
				break;
			case "Enter":
			case " ": {
				e.preventDefault();
				const opt = TYPE_OPTIONS[idx];
				if (opt) onCommit(opt.value);
				return;
			}
		}
		if (nextIdx !== null) {
			e.preventDefault();
			setCursor(nextIdx);
		}
	};

	return (
		<div className="space-y-4">
			<div>
				<h3 className="text-xl font-semibold">A person or a team?</h3>
				<p className="text-sm text-muted-foreground">
					Pick one — you can always change it later.
				</p>
			</div>
			<div className="grid grid-cols-2 gap-2" role="radiogroup">
				{TYPE_OPTIONS.map((opt, idx) => {
					const Icon = opt.icon;
					const active = value === opt.value;
					const highlighted = idx === cursor;
					return (
						<button
							key={opt.value}
							ref={(el) => {
								buttonsRef.current[idx] = el;
								if (idx === initialCursor) initialCardRef.current = el;
							}}
							type="button"
							role="radio"
							aria-checked={active}
							tabIndex={idx === initialCursor ? 0 : -1}
							onClick={() => onCommit(opt.value)}
							onFocus={() => setCursor(idx)}
							onKeyDown={(e) => handleKey(e, idx)}
							className={cn(
								"flex items-start gap-3 p-3 rounded-lg border text-left transition-all outline-none",
								active
									? "border-primary bg-primary/10 shadow-sm shadow-primary/20"
									: highlighted
										? "border-primary/60 bg-muted/40"
										: "border-primary/15 hover:border-primary/40 hover:bg-muted/40",
								"focus-visible:ring-2 focus-visible:ring-primary/50",
							)}
						>
							<Icon
								className={cn(
									"size-5 shrink-0 mt-0.5",
									active || highlighted
										? "text-primary"
										: "text-muted-foreground",
								)}
							/>
							<div className="min-w-0">
								<div className="font-medium text-sm">{opt.label}</div>
								<div className="text-xs text-muted-foreground">{opt.hint}</div>
							</div>
						</button>
					);
				})}
			</div>
		</div>
	);
}

function StepName({
	typeLabel,
	value,
	onChange,
	onEnter,
}: {
	typeLabel: string;
	value: string;
	onChange: (v: string) => void;
	onEnter: () => void;
}) {
	const inputRef = useRef<HTMLInputElement | null>(null);
	useWizardAutoFocus(inputRef);
	return (
		<div className="space-y-4">
			<div>
				<h3 className="text-xl font-semibold">What's the name?</h3>
				<p className="text-sm text-muted-foreground">
					How the {typeLabel} will be referred to in the catalog.
				</p>
			</div>
			<Input
				ref={inputRef}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				placeholder={typeLabel === "team" ? "e.g. Data Team" : "e.g. Alice Smith"}
				className="h-12 text-base"
				onKeyDown={(e) => {
					if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
						e.preventDefault();
						onEnter();
					}
				}}
			/>
		</div>
	);
}

function StepEmail({
	typeLabel,
	value,
	onChange,
	onEnter,
}: {
	typeLabel: string;
	value: string;
	onChange: (v: string) => void;
	onEnter: () => void;
}) {
	const inputRef = useRef<HTMLInputElement | null>(null);
	useWizardAutoFocus(inputRef);
	return (
		<div className="space-y-4">
			<div>
				<h3 className="text-xl font-semibold">
					How can people reach {typeLabel === "team" ? "the team" : "them"}?
				</h3>
				<p className="text-sm text-muted-foreground">
					An email. Optional — press{" "}
					<Kbd>↵</Kbd> when you're ready.
				</p>
			</div>
			<Input
				ref={inputRef}
				type="email"
				value={value}
				onChange={(e) => onChange(e.target.value)}
				placeholder={typeLabel === "team" ? "team@company.com" : "alice@company.com"}
				className="h-12 text-base"
				onKeyDown={(e) => {
					if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
						e.preventDefault();
						onEnter();
					}
				}}
			/>
		</div>
	);
}

function StepDescription({
	value,
	onChange,
}: {
	value: string;
	onChange: (v: string) => void;
}) {
	const taRef = useRef<HTMLTextAreaElement | null>(null);
	useWizardAutoFocus(taRef);
	return (
		<div className="space-y-4">
			<div>
				<h3 className="text-xl font-semibold">A short description?</h3>
				<p className="text-sm text-muted-foreground">
					Optional — who they are, what they do.
				</p>
			</div>
			<Textarea
				ref={taRef}
				rows={3}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				placeholder="e.g. Owns the customer data warehouse and runs weekly health checks."
			/>
		</div>
	);
}

interface PersonHit {
	uid: string;
	name: string;
}

interface SearchItem {
	kind: string;
	uid?: string;
	name?: string;
	type?: string;
}

function StepMembers({
	teamName,
	value,
	onChange,
}: {
	teamName: string;
	value: MemberRef[];
	onChange: (v: MemberRef[]) => void;
}) {
	const [query, setQuery] = useState("");
	const debounced = useDebounce(query, 150);
	const [suggestions, setSuggestions] = useState<PersonHit[]>([]);
	const [cursor, setCursor] = useState(0);
	const inputRef = useRef<HTMLInputElement | null>(null);
	useWizardAutoFocus(inputRef);

	useEffect(() => {
		if (debounced.trim().length === 0) {
			setSuggestions([]);
			setCursor(0);
			return;
		}
		const ctrl = new AbortController();
		(async () => {
			try {
				const res = await fetch(
					`/api/holocron/search?${new URLSearchParams({
						q: debounced.trim(),
						limit: "10",
					})}`,
					{ signal: ctrl.signal },
				);
				if (!res.ok) return;
				const body = (await res.json()) as { items: SearchItem[] };
				const hits: PersonHit[] = [];
				for (const item of body.items) {
					// Members are always persons — filter out groups so a team
					// doesn't end up nested inside another team by accident.
					if (
						item.kind === "actor" &&
						item.type === "person" &&
						typeof item.uid === "string" &&
						typeof item.name === "string"
					) {
						hits.push({ uid: item.uid, name: item.name });
					}
				}
				setSuggestions(hits);
				setCursor(0);
			} catch {
				/* aborted */
			}
		})();
		return () => ctrl.abort();
	}, [debounced]);

	const pickedUids = new Set(value.map((m) => m.uid));
	const trimmed = debounced.trim();
	const visibleExisting = suggestions.filter((s) => !pickedUids.has(s.uid));
	const exactMatch =
		trimmed.length > 0 &&
		visibleExisting.some(
			(s) => s.name.toLowerCase() === trimmed.toLowerCase(),
		);

	type Option =
		| { kind: "existing"; hit: PersonHit }
		| { kind: "new-person"; name: string };
	const options: Option[] = [
		...visibleExisting.map((hit) => ({ kind: "existing" as const, hit })),
		...(trimmed.length > 0 && !exactMatch
			? [{ kind: "new-person" as const, name: trimmed }]
			: []),
	];
	const showDropdown = options.length > 0;

	const add = useCallback(
		(person: MemberRef) => {
			onChange([...value, person]);
			setQuery("");
			setSuggestions([]);
			setCursor(0);
			inputRef.current?.focus();
		},
		[value, onChange],
	);

	const commit = async (opt: Option) => {
		if (opt.kind === "existing") {
			add({ uid: opt.hit.uid, name: opt.hit.name });
			return;
		}
		// Recursive wizard call — ensures new people go through the same
		// actor-create flow as everywhere else.
		const created = await openCreateActorWizard({
			prefillName: opt.name,
			prefillType: "person",
		});
		if (created) {
			add({ uid: created.uid, name: created.name });
		}
	};

	const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
		if (e.metaKey || e.ctrlKey) return;
		if (e.key === "ArrowDown") {
			if (!showDropdown) return;
			e.preventDefault();
			setCursor((i) => Math.min(i + 1, options.length - 1));
		} else if (e.key === "ArrowUp") {
			if (!showDropdown) return;
			e.preventDefault();
			setCursor((i) => Math.max(i - 1, 0));
		} else if (e.key === "Enter") {
			if (!showDropdown) return;
			e.preventDefault();
			const opt = options[cursor];
			if (opt) void commit(opt);
		} else if (e.key === "Backspace" && query === "" && value.length > 0) {
			e.preventDefault();
			onChange(value.slice(0, -1));
		}
	};

	return (
		<div className="space-y-4">
			<div>
				<h3 className="text-xl font-semibold">Who's on {teamName}?</h3>
				<p className="text-sm text-muted-foreground">
					Add the people who belong to the team. Optional — you can always
					add more later.
				</p>
			</div>

			{value.length > 0 && (
				<div className="flex flex-wrap gap-1.5">
					{value.map((m, i) => (
						<span
							key={m.uid}
							className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-xs"
						>
							<User className="size-3 text-primary" />
							<span>{m.name}</span>
							<button
								type="button"
								tabIndex={-1}
								onClick={() => onChange(value.filter((_, j) => j !== i))}
								className="rounded-full hover:bg-primary/20 p-0.5"
								aria-label={`Remove ${m.name}`}
							>
								<X className="size-3" />
							</button>
						</span>
					))}
				</div>
			)}

			<div className="relative">
				<Input
					ref={inputRef}
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					onKeyDown={handleKey}
					placeholder={
						value.length === 0
							? "Type a person's name to add them…"
							: "Add another…"
					}
					className="h-11"
					aria-autocomplete="list"
					aria-expanded={showDropdown}
				/>
				{showDropdown && (
					<ul
						role="listbox"
						className="absolute z-20 top-full left-0 right-0 mt-1.5 rounded-md border border-primary/15 bg-popover shadow-lg shadow-primary/10 overflow-hidden"
					>
						{options.map((opt, idx) => {
							const active = idx === cursor;
							const Icon = opt.kind === "existing" ? User : UserPlus;
							return (
								<li key={`member-opt-${idx}`} role="option" aria-selected={active}>
									<button
										type="button"
										onClick={() => void commit(opt)}
										onMouseEnter={() => setCursor(idx)}
										className={cn(
											"w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
											active ? "bg-primary/10" : "hover:bg-muted/40",
										)}
									>
										<Icon className="size-4 text-primary" />
										<span>
											{opt.kind === "existing" ? (
												opt.hit.name
											) : (
												<>
													Add <strong>{opt.name}</strong> as a new person
												</>
											)}
										</span>
										{opt.kind === "new-person" && (
											<span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground">
												new
											</span>
										)}
									</button>
								</li>
							);
						})}
					</ul>
				)}
			</div>
		</div>
	);
}

function StepReview({ data }: { data: ActorData }) {
	if (!data.type) return null;
	const Icon = getActorTypeIcon(data.type);
	return (
		<div className="space-y-4">
			<div>
				<h3 className="text-xl font-semibold">Ready?</h3>
				<p className="text-sm text-muted-foreground">
					Quick sanity check before we create it.
				</p>
			</div>
			<div className="rounded-lg border border-primary/15 bg-muted/20 p-4 space-y-2">
				<div className="flex items-center gap-3">
					<Icon className="size-5 text-primary" />
					<div>
						<div className="font-medium">{data.name.trim() || "Unnamed"}</div>
						<div className="text-xs text-muted-foreground uppercase tracking-wide">
							{data.type === "group" ? "team" : "person"}
						</div>
					</div>
				</div>
				{data.email.trim() && (
					<div className="text-sm text-muted-foreground">
						<span className="text-foreground/70">Email: </span>
						<code className="bg-background/60 rounded px-1.5 py-0.5 font-mono text-xs">
							{data.email.trim()}
						</code>
					</div>
				)}
				{data.description.trim() && (
					<p className="text-sm text-muted-foreground">
						{data.description.trim()}
					</p>
				)}
				{data.type === "group" && data.members.length > 0 && (
					<div className="pt-2 border-t border-primary/10">
						<div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5 flex items-center gap-1.5">
							<User className="size-3" /> Members
						</div>
						<div className="flex flex-wrap gap-1.5">
							{data.members.map((m) => (
								<span
									key={m.uid}
									className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-background/60 px-2 py-0.5 text-xs"
								>
									<User className="size-3 text-primary" />
									{m.name}
								</span>
							))}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

/* ---------- Keyboard hint strip ---------- */

function HintStrip({
	step,
	canBack,
}: {
	step: ActorStepId;
	canBack: boolean;
}) {
	const stepBits: Record<ActorStepId, React.ReactNode> = {
		type: (
			<>
				<Kbd>←→</Kbd> choose · <Kbd>↵</Kbd> select
			</>
		),
		name: (
			<>
				<Kbd>↵</Kbd> next
			</>
		),
		email: (
			<>
				<Kbd>↵</Kbd> next
			</>
		),
		description: (
			<>
				<Kbd>⌃→</Kbd> next
			</>
		),
		members: (
			<>
				<Kbd>↑↓</Kbd> pick · <Kbd>↵</Kbd> add · <Kbd>⌫</Kbd> remove last ·{" "}
				<Kbd>⌃→</Kbd> next
			</>
		),
		review: (
			<>
				<Kbd>↵</Kbd> create
			</>
		),
	};
	return (
		<div className="text-[11px] text-muted-foreground/70 flex flex-wrap items-center gap-x-3 gap-y-1 pt-1">
			{stepBits[step]}
			{canBack && (
				<>
					{" · "}
					<Kbd>⌃←</Kbd> back
				</>
			)}
		</div>
	);
}
