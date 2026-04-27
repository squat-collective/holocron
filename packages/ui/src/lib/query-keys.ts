/**
 * Query key factory for TanStack Query.
 * Hierarchical keys enable easy cache invalidation.
 *
 * @example
 * // Invalidate all assets
 * queryClient.invalidateQueries({ queryKey: queryKeys.assets.all });
 *
 * // Invalidate specific asset
 * queryClient.invalidateQueries({ queryKey: queryKeys.assets.detail('abc123') });
 */
export const queryKeys = {
	assets: {
		all: ["assets"] as const,
		lists: () => [...queryKeys.assets.all, "list"] as const,
		list: (filters?: { search?: string; type?: string; status?: string }) =>
			[...queryKeys.assets.lists(), filters] as const,
		details: () => [...queryKeys.assets.all, "detail"] as const,
		detail: (uid: string) => [...queryKeys.assets.details(), uid] as const,
	},

	actors: {
		all: ["actors"] as const,
		lists: () => [...queryKeys.actors.all, "list"] as const,
		list: (filters?: { search?: string; type?: string }) =>
			[...queryKeys.actors.lists(), filters] as const,
		details: () => [...queryKeys.actors.all, "detail"] as const,
		detail: (uid: string) => [...queryKeys.actors.details(), uid] as const,
	},

	relations: {
		all: ["relations"] as const,
		lists: () => [...queryKeys.relations.all, "list"] as const,
		list: (filters?: { fromUid?: string; toUid?: string; type?: string }) =>
			[...queryKeys.relations.lists(), filters] as const,
	},

	search: {
		all: ["search"] as const,
		results: (query: string) => [...queryKeys.search.all, query] as const,
	},
} as const;
