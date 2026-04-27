import { HolocronClient } from "@squat-collective/holocron-ts";

/**
 * Server-side Holocron client singleton.
 * Use this in Server Components and API routes.
 *
 * For client-side, use the API proxy at /api/holocron/*
 */
export const holocron = new HolocronClient({
	baseUrl: process.env.HOLOCRON_API_URL ?? "http://holocron:8000",
});
