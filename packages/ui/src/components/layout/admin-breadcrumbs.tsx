"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

const SEGMENT_LABELS: Record<string, string> = {
	admin: "Admin",
	assets: "Assets",
	actors: "Actors",
	relations: "Relations",
	rules: "Rules",
	extensions: "Extensions",
	new: "New",
	edit: "Edit",
};

/**
 * Admin breadcrumbs derived from the pathname. Unknown segments (typically
 * UIDs) render as a shortened code so deep detail pages still stay readable.
 */
export function AdminBreadcrumbs() {
	const pathname = usePathname();
	if (!pathname.startsWith("/admin")) return null;

	const segments = pathname.split("/").filter(Boolean);
	const crumbs = segments.map((segment, i) => {
		const href = "/" + segments.slice(0, i + 1).join("/");
		const label = SEGMENT_LABELS[segment] ?? shortenUid(segment);
		return { href, label, isLast: i === segments.length - 1 };
	});

	if (crumbs.length <= 1) return null;

	return (
		<Breadcrumb className="mb-4">
			<BreadcrumbList>
				{crumbs.map((crumb, i) => (
					<span key={crumb.href} className="contents">
						<BreadcrumbItem>
							{crumb.isLast ? (
								<BreadcrumbPage>{crumb.label}</BreadcrumbPage>
							) : (
								<BreadcrumbLink asChild>
									<Link href={crumb.href}>{crumb.label}</Link>
								</BreadcrumbLink>
							)}
						</BreadcrumbItem>
						{i < crumbs.length - 1 && <BreadcrumbSeparator />}
					</span>
				))}
			</BreadcrumbList>
		</Breadcrumb>
	);
}

function shortenUid(segment: string): string {
	// Uid-like strings get truncated with a leading slash; everything else is
	// title-cased so unknown routes still read nicely.
	if (/^[0-9a-f]{8,}$/i.test(segment) || segment.includes("-")) {
		return segment.length > 10 ? segment.slice(0, 8) + "…" : segment;
	}
	return segment.charAt(0).toUpperCase() + segment.slice(1);
}
