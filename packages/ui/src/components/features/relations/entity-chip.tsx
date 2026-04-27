"use client";

import Link from "next/link";
import { getEntityStyle } from "@/lib/entity-styles";

interface EntityChipProps {
	uid: string;
	name: string;
	type: string;
	entityKind: "actor" | "asset";
}

/**
 * Compact pill that links to an entity's detail page, showing its icon,
 * name and type badge. Re-used across the relations list + any future
 * relation-rendering surfaces.
 */
export function EntityChip({ uid, name, type, entityKind }: EntityChipProps) {
	const style = getEntityStyle(type);
	const Icon = style.icon;
	const href = entityKind === "actor" ? `/actors/${uid}` : `/assets/${uid}`;
	return (
		<Link
			href={href}
			className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm transition-colors hover:opacity-80 ${style.bg} ${style.border}`}
		>
			<Icon className={`size-4 ${style.text}`} />
			<span className={`font-medium ${style.text}`}>{name}</span>
			<span className={`rounded border px-1 text-xs ${style.badge}`}>{style.label}</span>
		</Link>
	);
}
