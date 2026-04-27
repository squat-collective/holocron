import { AlertCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface UnverifiedBadgeProps {
	discoveredBy?: string | null;
	className?: string;
}

export function UnverifiedBadge({ discoveredBy, className }: UnverifiedBadgeProps) {
	const tooltipText = discoveredBy
		? `Auto-discovered by ${discoveredBy} — not yet confirmed`
		: "Auto-discovered — not yet confirmed";

	return (
		<TooltipProvider delayDuration={150}>
			<Tooltip>
				<TooltipTrigger asChild>
					<Badge
						variant="outline"
						className={`bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900 dark:text-amber-200 dark:border-amber-800 ${className ?? ""}`}
					>
						<AlertCircle className="size-3" />
						Unverified
					</Badge>
				</TooltipTrigger>
				<TooltipContent>{tooltipText}</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}
