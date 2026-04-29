import { Braces, Copy, FileText, Link as LinkIcon } from "lucide-react";
import { toast } from "sonner";
import type { Extension, FocusedEntity } from "../types";

/**
 * Share — clipboard actions for the focused entity.
 *
 * Cross-cutting by design: the same five commands work whether the user
 * is on an asset, actor, or rule page. The Markdown summary is per-kind
 * (different fields matter for each), but the dispatch lives here so
 * adding a new entity kind is a single switch arm.
 */
export const shareExtension: Extension = {
	id: "share",
	name: "Share",
	description: "Clipboard actions for the focused entity.",
	// Relations are transient (hover-publish from the relations sidebar)
	// and don't have a paste-into-Slack story, so the Share command set
	// stays scoped to the persistent kinds (asset / actor / rule).
	when: (ctx) =>
		ctx.focused !== null && ctx.focused.kind !== "relation",
	commands: (ctx) => {
		const focused = ctx.focused;
		if (!focused) return [];
		const { entity } = focused;

		return [
			{
				id: "copy-uid",
				label: "Copy UID",
				hint: entity.uid,
				keywords: ["copy", "uid", "id"],
				group: "Share",
				icon: Copy,
				order: 10,
				run: () => copyText(entity.uid, "UID copied"),
			},
			{
				id: "copy-link",
				label: "Copy link",
				hint: `URL to this ${focused.kind} page`,
				keywords: ["copy", "link", "url", "share"],
				group: "Share",
				icon: LinkIcon,
				order: 20,
				run: () => copyText(window.location.href, "Link copied"),
			},
			{
				id: "copy-json",
				label: "Copy as JSON",
				hint: "Full entity object — pretty-printed",
				keywords: ["copy", "json", "data", "export"],
				group: "Share",
				icon: Braces,
				order: 30,
				run: () =>
					copyText(
						JSON.stringify(entity, null, 2),
						`${capitalise(focused.kind)} JSON copied`,
					),
			},
			{
				id: "copy-markdown",
				label: "Copy as Markdown summary",
				hint: "Title + key facts — paste in Slack or docs",
				keywords: ["copy", "markdown", "md", "summary", "share"],
				group: "Share",
				icon: FileText,
				order: 40,
				run: () => copyText(toMarkdown(focused), "Markdown summary copied"),
			},
		];
	},
};

async function copyText(text: string, success: string): Promise<void> {
	try {
		await navigator.clipboard.writeText(text);
		toast.success(success);
	} catch {
		toast.error("Clipboard unavailable");
	}
}

function capitalise(s: string): string {
	return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Per-kind Markdown blurb. Goal: paste-into-Slack-and-it-looks-fine. We
 * lead with a level-3 heading so it doesn't blow out a thread, list a few
 * key fields as a bullet list, then stop. No metadata dumps — that's what
 * Copy as JSON is for.
 */
function toMarkdown(focused: FocusedEntity): string {
	const lines: string[] = [];
	if (focused.kind === "asset") {
		const a = focused.entity;
		lines.push(`### ${a.name}`);
		lines.push("");
		lines.push(`- **Type:** ${a.type}`);
		lines.push(`- **Status:** ${a.status}`);
		if (a.location) lines.push(`- **Location:** \`${a.location}\``);
		if (a.description) {
			lines.push("");
			lines.push(a.description);
		}
		lines.push("");
		lines.push(`UID: \`${a.uid}\``);
	} else if (focused.kind === "actor") {
		const a = focused.entity;
		lines.push(`### ${a.name}`);
		lines.push("");
		lines.push(`- **Type:** ${a.type}`);
		if (a.email) lines.push(`- **Email:** ${a.email}`);
		if (a.description) {
			lines.push("");
			lines.push(a.description);
		}
		lines.push("");
		lines.push(`UID: \`${a.uid}\``);
	} else if (focused.kind === "rule") {
		const r = focused.entity;
		lines.push(`### ${r.name}`);
		lines.push("");
		lines.push(`- **Severity:** ${r.severity}`);
		if (r.category) lines.push(`- **Category:** ${r.category}`);
		if (r.description) {
			lines.push("");
			lines.push(r.description);
		}
		lines.push("");
		lines.push(`UID: \`${r.uid}\``);
	}
	return lines.join("\n");
}
