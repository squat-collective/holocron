import {
	AlertCircle,
	AlertOctagon,
	AlertTriangle,
	ArrowRightLeft,
	Bell,
	Box,
	ChartLine,
	CircleDot,
	Crown,
	Database,
	Eye,
	FileJson,
	FileText,
	FolderOpen,
	Globe2,
	HandHelping,
	Handshake,
	Hash,
	Layers,
	LayoutDashboard,
	Link2,
	type LucideIcon,
	Orbit,
	Package,
	Plug,
	Search,
	Server,
	Sheet,
	ShieldCheck,
	Sparkles,
	Table2,
	User,
	UserCheck,
	Users,
	Workflow,
	Wrench,
} from "lucide-react";

export type { LucideIcon };

export const BrandIcon = Orbit;
export const SearchIcon = Search;
export const DashboardIcon = LayoutDashboard;
export const AssetIcon = Database;
export const ActorIcon = Users;
export const RelationIcon = Link2;
export const RuleIcon = ShieldCheck;
export const MetadataIcon = Layers;
export const SpecIcon = FileText;
export const CreateIcon = Sparkles;
export const MapIcon = Globe2;

export const assetTypeIcons = {
	dataset: Database,
	process: Workflow,
	report: ChartLine,
	system: Server,
} as const satisfies Record<string, LucideIcon>;

export function getAssetTypeIcon(type: string | null | undefined): LucideIcon {
	if (type && type in assetTypeIcons) {
		return assetTypeIcons[type as keyof typeof assetTypeIcons];
	}
	return Package;
}

export const actorTypeIcons = {
	person: User,
	group: Users,
} as const satisfies Record<string, LucideIcon>;

export function getActorTypeIcon(type: string | null | undefined): LucideIcon {
	if (type && type in actorTypeIcons) {
		return actorTypeIcons[type as keyof typeof actorTypeIcons];
	}
	return User;
}

export const containerTypeIcons = {
	sheet: Sheet,
	table: Table2,
	page: FileText,
	section: FolderOpen,
	view: Eye,
	dashboard: LayoutDashboard,
	model: FileJson,
	endpoint: Plug,
	other: Package,
} as const satisfies Record<string, LucideIcon>;

export function getContainerTypeIcon(type: string | null | undefined): LucideIcon {
	if (type && type in containerTypeIcons) {
		return containerTypeIcons[type as keyof typeof containerTypeIcons];
	}
	return Box;
}

export const SchemaFieldIcon = CircleDot;
export const PiiIcon = Hash;

export const relationTypeIcons = {
	uses: Wrench,
	contains: Package,
	owns: Crown,
	feeds: ArrowRightLeft,
	member_of: UserCheck,
	part_of: Handshake,
	maintains: HandHelping,
	applies_to: ShieldCheck,
} as const satisfies Record<string, LucideIcon>;

export function getRelationTypeIcon(type: string | null | undefined): LucideIcon {
	if (type && type in relationTypeIcons) {
		return relationTypeIcons[type as keyof typeof relationTypeIcons];
	}
	return Link2;
}

export const enforcementIcons = {
	enforced: ShieldCheck,
	alerting: Bell,
	documented: FileText,
} as const;

export const severityIcons = {
	info: AlertCircle,
	warning: AlertTriangle,
	critical: AlertOctagon,
} as const;
