import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UnverifiedBadge } from "@/components/ui/unverified-badge";
import { getActorTypeIcon } from "@/lib/icons";

interface Actor {
	uid: string;
	type: "person" | "group";
	name: string;
	email: string | null;
	verified?: boolean;
	discovered_by?: string | null;
}

interface ActorCardProps {
	actor: Actor;
}

const typeColors = {
	person: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
	group: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
} as const;

/**
 * Card component for displaying an actor in lists.
 */
export function ActorCard({ actor }: ActorCardProps) {
	const Icon = getActorTypeIcon(actor.type);

	return (
		<Link href={`/actors/${actor.uid}`}>
			<Card className="hover:shadow-md transition-shadow cursor-pointer">
				<CardHeader className="pb-2">
					<div className="flex items-center justify-between gap-2">
						<div className="flex items-center gap-2">
							<Icon className="size-5 text-primary shrink-0" />
							<CardTitle className="text-lg">{actor.name}</CardTitle>
						</div>
						<div className="flex gap-2 flex-wrap">
							{actor.verified === false && <UnverifiedBadge discoveredBy={actor.discovered_by} />}
							<Badge variant="outline" className={typeColors[actor.type]}>
								{actor.type}
							</Badge>
						</div>
					</div>
				</CardHeader>
				{actor.email && (
					<CardContent className="pt-0">
						<p className="text-sm text-muted-foreground">{actor.email}</p>
					</CardContent>
				)}
			</Card>
		</Link>
	);
}
