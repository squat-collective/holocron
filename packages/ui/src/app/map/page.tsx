import { redirect } from "next/navigation";

/**
 * `/map` was a standalone route in the spike. The galaxy now lives on
 * the home page as one of two display modes; this page exists only so
 * old bookmarks and the `g m` chord still land somewhere sensible.
 */
export default function MapRedirect() {
	redirect("/?mode=map");
}
