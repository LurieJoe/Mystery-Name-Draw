import { useEffect, useRef, useState } from "react";

/**
 * A router for a handful of routes, with no dependency.
 *
 * Routes live in the URL fragment ("/#/event/ABC123") rather than the
 * path. A static host like GitHub Pages has no server-side fallback, so
 * a real path such as /event/ABC123 returns 404 on a fresh visit - and
 * that path is the registration link emailed to every invitee, so it is
 * the one URL that must never break.
 *
 * A fragment is never sent to the server, so these links work on any
 * host. That also makes moving hosts later a non-event: links already
 * sent keep working.
 */

/** The current route, e.g. "/event/ABC123". Defaults to "/". */
function currentRoute() {
  return window.location.hash.replace(/^#/, "") || "/";
}

/**
 * Whether arriving at `next` from `previous` means starting at the top.
 *
 * Changing the hash does not scroll anywhere on its own: the browser
 * looks for an element whose id matches, finds none for "/quick", and
 * leaves the page exactly where it was. Following the Quick Draw link
 * at the foot of the landing page therefore opened Quick Draw already
 * scrolled to its foot.
 *
 * Not every hash is a page, though. "#how-it-works" points at a section
 * of the page you are already on, and that one must keep the browser's
 * own behaviour. Routes begin with a slash and anchors do not, which is
 * the whole difference.
 */
export function shouldScrollToTop(previous: string, next: string) {
  return previous !== next && next.startsWith("/");
}

export function usePath() {
  const [route, setRoute] = useState(currentRoute);
  const previous = useRef(route);

  useEffect(() => {
    const sync = () => setRoute(currentRoute());

    window.addEventListener("hashchange", sync);

    return () => window.removeEventListener("hashchange", sync);
  }, []);

  useEffect(() => {
    if (shouldScrollToTop(previous.current, route)) {
      window.scrollTo(0, 0);
    }

    previous.current = route;
  }, [route]);

  return route;
}

export function navigate(to: string) {
  const target = to.startsWith("/") ? to : `/${to}`;

  if (target === currentRoute()) {
    return;
  }

  // Assigning the hash fires `hashchange`, which updates every usePath.
  window.location.hash = target;
}

/**
 * An absolute URL for a route, safe to paste into an email.
 *
 * Built from the running origin and path so it is correct wherever the
 * app is served: localhost while developing, a custom domain in
 * production, or a project subpath on GitHub Pages.
 */
export function routeUrl(route: string) {
  const base =
    `${window.location.origin}${window.location.pathname}`.replace(
      /\/$/,
      ""
    );

  return `${base}/#${route}`;
}

/**
 * The organizer's token in /manage/TOKEN, or null.
 *
 * This is the one URL that is a credential: whoever opens it manages
 * the exchange. It is read once, kept in this browser, and taken out
 * of the address bar straight away, so it stops sitting in history and
 * over the shoulder of whoever is next to you. The link itself still
 * works, which is the point of having it.
 */
export function matchManageToken(route: string): string | null {
  const match = route.match(/^\/manage\/([A-Za-z0-9]{32,128})\/?$/);

  return match ? match[1] : null;
}

/** The event code in /event/CODE, or null for any other route. */
/**
 * The token in a personal link from an email.
 *
 * Matched the same way as the management token, and treated the same
 * way once matched: stored, then stripped out of the address bar. A
 * credential in a URL is a credential in browser history, in a
 * screenshot, and in whatever the person pastes into a group chat
 * when they mean to share the site.
 */
export function matchInviteeToken(route: string): string | null {
  const match = route.match(/^\/me\/([A-Za-z0-9]{32,128})\/?$/);

  return match ? match[1] : null;
}

export function matchEventCode(route: string): string | null {
  const match = route.match(/^\/event\/([A-Za-z0-9]+)\/?$/);

  return match ? match[1] : null;
}
