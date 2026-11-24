import { useEffect, useState } from "react";

/**
 * A router for a handful of routes, with no dependency.
 *
 * Uses the History API, so links are real paths rather than hashes.
 * Vite's dev server already serves index.html for unknown paths; any
 * production host needs the same SPA fallback, or /event/CODE will
 * 404 on a hard refresh.
 */

const PATH_CHANGED = "app:pathchanged";

export function usePath() {
  const [path, setPath] = useState(() => window.location.pathname);

  useEffect(() => {
    const sync = () => setPath(window.location.pathname);

    window.addEventListener("popstate", sync);
    window.addEventListener(PATH_CHANGED, sync);

    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener(PATH_CHANGED, sync);
    };
  }, []);

  return path;
}

export function navigate(to: string) {
  if (to === window.location.pathname) {
    return;
  }

  window.history.pushState({}, "", to);
  window.dispatchEvent(new Event(PATH_CHANGED));
}

/** The event code in /event/CODE, or null for any other path. */
export function matchEventCode(path: string): string | null {
  const match = path.match(/^\/event\/([A-Za-z0-9]+)\/?$/);

  return match ? match[1] : null;
}
