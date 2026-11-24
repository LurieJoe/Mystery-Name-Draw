import type { ReactNode } from "react";
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

  return (
    <ExchangeContext.Provider value={exchange}>
      {children}
    </ExchangeContext.Provider>
  );
}
