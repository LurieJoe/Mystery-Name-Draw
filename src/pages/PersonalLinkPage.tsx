import { useEffect, useRef, useState } from "react";
import Header from "../components/Header";
import SiteFooter from "../components/SiteFooter";
import { hasDatabase } from "../api/config";
import { fetchRegistration, rememberInvitee } from "../exchange/registration";
import { navigate } from "../router";
import "./ContentPage.css";
import "./RegisterPage.css";

/**
 * Where a link from an email lands.
 *
 * It carries a token and nothing else, so this page's whole job is to
 * work out which exchange that token belongs to, remember it for this
 * browser, and send the reader on to their own page at a plain
 * address.
 *
 * The redirect is the point, not tidiness. A token left in the
 * address bar is a credential in browser history, in a screenshot, and
 * in whatever gets pasted into a group chat by somebody meaning to
 * share the site. The management link has worked this way since it
 * existed; this is the same move for the other side.
 */
export default function PersonalLinkPage({ token }: { token: string }) {
  /*
   * Starts failed when there is no database to ask, rather than being
   * set so inside the effect: hasDatabase is fixed at build time, so
   * it is an initial value rather than something that happens.
   */
  const [failed, setFailed] = useState(!hasDatabase);

  // React runs effects twice in development. Redeeming twice is
  // harmless, but it would fetch twice for no reason.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    if (!hasDatabase) {
      return;
    }

    void (async () => {
      try {
        const view = await fetchRegistration(token);

        rememberInvitee(view.exchange.eventCode, token);
        navigate(`/event/${view.exchange.eventCode}`);
      } catch {
        setFailed(true);
      }
    })();
  }, [token]);

  return (
    <>
      <Header onStartExchange={() => navigate("/create")} />

      <main className="content-page register-page">
        {failed ? (
          <>
            <h1>That link didn't open anything</h1>

            <div className="register-notice">
              <h2>It may have expired</h2>
              <p>
                Links from us stop working a while after the exchange
                is over. If this one is older than that, there's
                nothing to see any more.
              </p>
              <p>
                Otherwise the link may have been cut short by whatever
                it was sent through, which happens to long links in
                chat apps. Try opening it from the original email, or
                ask the organizer to send you a new one.
              </p>
            </div>
          </>
        ) : (
          <>
            <h1>Opening your page</h1>
            <p className="register-empty" role="status">
              One moment.
            </p>
          </>
        )}
      </main>

      <SiteFooter />
    </>
  );
}
