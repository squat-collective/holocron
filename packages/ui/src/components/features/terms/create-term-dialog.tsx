"use client";

import { useState } from "react";
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
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCreateTerm } from "@/hooks/use-terms";

interface CreateTermDialogProps {
	open: boolean;
	onOpenChange: (next: boolean) => void;
}

/**
 * Minimal create form for a glossary term — enough fields to make the
 * entry useful (name, definition, domain, status, pii) without
 * overwhelming the first-time user. Power-user fields like `formula`
 * and `unit` live behind an "Advanced" disclosure.
 */
export function CreateTermDialog({ open, onOpenChange }: CreateTermDialogProps) {
	const create = useCreateTerm();
	const [name, setName] = useState("");
	const [definition, setDefinition] = useState("");
	const [domain, setDomain] = useState("");
	const [status, setStatus] = useState<"draft" | "approved" | "deprecated">(
		"draft",
	);
	const [pii, setPii] = useState(false);
	const [advanced, setAdvanced] = useState(false);
	const [formula, setFormula] = useState("");
	const [unit, setUnit] = useState("");

	const reset = () => {
		setName("");
		setDefinition("");
		setDomain("");
		setStatus("draft");
		setPii(false);
		setFormula("");
		setUnit("");
		setAdvanced(false);
	};

	const handleClose = (next: boolean) => {
		if (!next) setTimeout(reset, 200);
		onOpenChange(next);
	};

	const submit = async () => {
		if (!name.trim() || !definition.trim()) return;
		try {
			await create.mutateAsync({
				name: name.trim(),
				definition: definition.trim(),
				domain: domain.trim() || undefined,
				status,
				pii,
				formula: formula.trim() || undefined,
				unit: unit.trim() || undefined,
			});
			handleClose(false);
		} catch {
			// useCreateTerm surfaces the toast on error.
		}
	};

	return (
		<Dialog open={open} onOpenChange={handleClose}>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle>New glossary term</DialogTitle>
					<DialogDescription>
						Give a business concept a single, canonical definition.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-3">
					<div>
						<Label htmlFor="term-name">Name</Label>
						<Input
							id="term-name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="Active Customer"
						/>
					</div>
					<div>
						<Label htmlFor="term-definition">Definition</Label>
						<Textarea
							id="term-definition"
							value={definition}
							onChange={(e) => setDefinition(e.target.value)}
							placeholder="A customer that has placed at least one order in the past 90 days."
							rows={3}
						/>
					</div>
					<div className="grid grid-cols-2 gap-3">
						<div>
							<Label htmlFor="term-domain">Domain</Label>
							<Input
								id="term-domain"
								value={domain}
								onChange={(e) => setDomain(e.target.value)}
								placeholder="Sales"
							/>
						</div>
						<div>
							<Label htmlFor="term-status">Status</Label>
							<Select
								value={status}
								onValueChange={(v) =>
									setStatus(v as "draft" | "approved" | "deprecated")
								}
							>
								<SelectTrigger id="term-status">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="draft">Draft</SelectItem>
									<SelectItem value="approved">Approved</SelectItem>
									<SelectItem value="deprecated">Deprecated</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</div>
					<div className="flex items-center gap-2">
						<Checkbox
							id="term-pii"
							checked={pii}
							onCheckedChange={(c) => setPii(c === true)}
						/>
						<Label htmlFor="term-pii" className="font-normal">
							Contains PII
						</Label>
					</div>
					<button
						type="button"
						className="text-xs text-primary hover:underline"
						onClick={() => setAdvanced((a) => !a)}
					>
						{advanced ? "Hide advanced" : "Advanced (formula, unit)"}
					</button>
					{advanced && (
						<div className="grid grid-cols-2 gap-3 pt-1">
							<div>
								<Label htmlFor="term-formula">Formula</Label>
								<Input
									id="term-formula"
									value={formula}
									onChange={(e) => setFormula(e.target.value)}
									placeholder="SUM(orders.amount)"
								/>
							</div>
							<div>
								<Label htmlFor="term-unit">Unit</Label>
								<Input
									id="term-unit"
									value={unit}
									onChange={(e) => setUnit(e.target.value)}
									placeholder="USD"
								/>
							</div>
						</div>
					)}
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={() => handleClose(false)}>
						Cancel
					</Button>
					<Button
						onClick={submit}
						disabled={
							create.isPending || !name.trim() || !definition.trim()
						}
					>
						{create.isPending ? "Creating…" : "Create term"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
