"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";

interface QueryProviderProps {
	children: ReactNode;
}

/**
 * TanStack Query provider for client-side data fetching.
 * Creates a new QueryClient per request to avoid sharing state between users.
 */
export function QueryProvider({ children }: QueryProviderProps) {
	const [queryClient] = useState(
		() =>
			new QueryClient({
				defaultOptions: {
					queries: {
						// Cache data for 30 seconds by default
						staleTime: 30 * 1000,
						// Retry failed requests once
						retry: 1,
						// Don't refetch on window focus in development
						refetchOnWindowFocus: process.env.NODE_ENV === "production",
					},
				},
			}),
	);

	return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
