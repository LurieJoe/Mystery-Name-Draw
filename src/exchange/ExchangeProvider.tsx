import { useEffect, useRef, type ReactNode } from "react";
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
  const restored = useRef(false);

  // Once, on load, whichever route the person landed on: if this
  // browser made an exchange, it should still be here afterwards.
  // Before this, a reload lost everything, which is the whole reason
  // the database exists.
  useEffect(() => {
    if (restored.current) {
      return;
    }

    restored.current = true;
    void exchange.restoreExchange();
  }, [exchange]);

  return (
    <ExchangeContext.Provider value={exchange}>
      {children}
    </ExchangeContext.Provider>
  );
}
