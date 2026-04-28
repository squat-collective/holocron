"use client";

import type { WebhookCreated } from "@squat-collective/holocron-ts";
import { Check, Copy, Plus, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import { useCreateWebhook } from "@/hooks/use-webhooks";

const EVENT_TOPICS = [
	"asset.created",
	"asset.updated",
	"asset.deleted",
	"actor.created",
	"actor.updated",
	"actor.deleted",
	"relation.created",
	"relation.deleted",
	"rule.created",
	"rule.updated",
	"rule.deleted",
] as const;

export function CreateWebhookDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (next: boolean) => void;
}) {
	const create = useCreateWebhook();
	const [created, setCreated] = useState<WebhookCreated | null>(null);
	const [url, setUrl] = useState("");
	const [description, setDescription] = useState("");
	const [allEvents, setAllEvents] = useState(true);
	const [selectedEvents, setSelectedEvents] = useState<Set<string>>(new Set());

	const reset = () => {
		setUrl("");
		setDescription("");
		setAllEvents(true);
		setSelectedEvents(new Set());
		setCreated(null);
	};

	const handleClose = (next: boolean) => {
		if (!next) {
			// Reset state once the dialog has closed so the next open is clean.
			setTimeout(reset, 200);
		}
		onOpenChange(next);
	};

	const submit = async () => {
		if (!url.trim()) return;
		const events = allEvents ? ["*"] : Array.from(selectedEvents);
		if (events.length === 0) {
			toast.error("Pick at least one event topic, or check 'All events'.");
			return;
		}
		try {
			const result = await create.mutateAsync({
				url: url.trim(),
				events,
				description: description.trim() || undefined,
			});
			setCreated(result);
		} catch {
			// useCreateWebhook surfaces the toast on error.
		}
	};

	if (created) {
		return (
			<Dialog open={open} onOpenChange={handleClose}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Webhook registered — copy the secret now</DialogTitle>
						<DialogDescription>
							The HMAC secret below is shown <strong>only this once</strong>.
							Store it in your receiver's signature verifier; the API will not
							surface it again.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-3">
						<div>
							<Label className="text-xs uppercase tracking-wide text-muted-foreground">
								URL
							</Label>
							<p className="font-mono text-sm break-all mt-1">{created.url}</p>
						</div>
						<div>
							<Label className="text-xs uppercase tracking-wide text-muted-foreground">
								HMAC secret
							</Label>
							<div className="flex items-center gap-2 mt-1">
								<code className="font-mono text-sm bg-muted/40 px-2 py-1 rounded flex-1 break-all">
									{created.secret}
								</code>
								<Button
									type="button"
									size="icon"
									variant="ghost"
									onClick={() => {
										navigator.clipboard.writeText(created.secret);
										toast.success("Secret copied");
									}}
								>
									<Copy className="size-4" />
								</Button>
							</div>
						</div>
						<div className="text-xs text-muted-foreground">
							Receivers verify each request via{" "}
							<code className="font-mono">X-Holocron-Signature</code>:{" "}
							<code className="font-mono">sha256=&lt;hmac&gt;</code>.
						</div>
					</div>
					<DialogFooter>
						<Button onClick={() => handleClose(false)}>
							<Check className="size-4" />
							Done
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		);
	}

	return (
		<Dialog open={open} onOpenChange={handleClose}>
			<DialogContent className="sm:max-w-xl">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Send className="size-4" />
						New webhook
					</DialogTitle>
					<DialogDescription>
						Register a receiver URL. Each subscribed event becomes an HMAC-signed
						POST to this URL.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					<div className="space-y-1.5">
						<Label htmlFor="webhook-url">Receiver URL</Label>
						<Input
							id="webhook-url"
							type="url"
							placeholder="https://hook.example.com/holocron"
							value={url}
							onChange={(e) => setUrl(e.target.value)}
							autoFocus
						/>
						<p className="text-xs text-muted-foreground">
							HTTPS recommended. The API does not enforce HTTPS to keep
							localhost dev receivers easy.
						</p>
					</div>

					<div className="space-y-1.5">
						<Label htmlFor="webhook-description">Description (optional)</Label>
						<Textarea
							id="webhook-description"
							placeholder="What this receiver does — e.g. 'Slack notifier for #data-alerts'."
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							rows={2}
						/>
					</div>

					<div className="space-y-2">
						<Label>Events to subscribe to</Label>
						<label className="flex items-center gap-2 cursor-pointer">
							<Checkbox
								checked={allEvents}
								onCheckedChange={(checked) => setAllEvents(checked === true)}
							/>
							<span className="text-sm font-medium">
								All events (recommended for first setup)
							</span>
						</label>
						{!allEvents && (
							<div className="grid grid-cols-2 gap-1.5 mt-2">
								{EVENT_TOPICS.map((topic) => {
									const active = selectedEvents.has(topic);
									return (
										<Badge
											key={topic}
											asChild
											variant={active ? "default" : "outline"}
											className="cursor-pointer font-mono text-[11px] py-1 justify-start"
										>
											<button
												type="button"
												onClick={() => {
													setSelectedEvents((prev) => {
														const next = new Set(prev);
														if (next.has(topic)) next.delete(topic);
														else next.add(topic);
														return next;
													});
												}}
											>
												{topic}
											</button>
										</Badge>
									);
								})}
							</div>
						)}
					</div>
				</div>

				<DialogFooter>
					<Button variant="ghost" onClick={() => handleClose(false)}>
						Cancel
					</Button>
					<Button
						onClick={submit}
						disabled={create.isPending || !url.trim()}
					>
						<Plus className="size-4" />
						{create.isPending ? "Registering…" : "Register"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
