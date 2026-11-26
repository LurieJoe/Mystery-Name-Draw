import { useEffect, useRef, type ReactNode } from "react";
import { MANAGE_STEP } from "./types";
import { matchManageToken, navigate, usePath } from "../router";
import { ExchangeContext } from "./context";
import { useExchange } from "./useExchange";

/**
 * Holds the exchange state for the whole app.
 *
 * Only components are exported from this file, so Fast Refresh keeps
 * working; the context object and its hook live in context.ts.
 */
export function ExchangeProvider({ children }: { children: ReactNode }) {
  const exchange = useExchange();
  const route = usePath();
  const restored = useRef(false);

  // Once, on load, whichever route the person landed on: if this
  // browser made an exchange, or the person arrived holding the
  // management link, it should be here. Before this, a reload lost
  // everything, which is the whole reason the database exists.
  useEffect(() => {
    if (restored.current) {
      return;
    }

    restored.current = true;

    const tokenFromLink = matchManageToken(route);

    void exchange.restoreExchange(tokenFromLink ?? undefined).then((ok) => {
      if (!tokenFromLink) {
        return;
      }

      /*
       * Straight to the manage screen, not to step one of the wizard.
       *
       * The management link is how an organizer comes back to an
       * exchange that already exists, and what they come back for is
       * almost always "who has registered". Landing on the settings
       * form meant walking the whole wizard - Continue, Save Changes,
       * Invite Participants - and scrolling each screen to find out.
       */
      if (ok) {
        exchange.setCurrentStep(MANAGE_STEP);
      }

      // Off the address bar either way. It worked, and this browser
      // now remembers it; or it did not, and leaving a dead credential
      // in the URL and in history helps nobody.
      navigate(ok ? "/create" : "/");
    });
    // Deliberately once, on mount: re-running this on every route
    // change would fight whatever the person is doing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ExchangeContext.Provider value={exchange}>
      {children}
    </ExchangeContext.Provider>
  );
}
