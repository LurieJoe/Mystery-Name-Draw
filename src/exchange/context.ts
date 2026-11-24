import { createContext, useContext } from "react";
import type { ExchangeState } from "./useExchange";

export const ExchangeContext = createContext<ExchangeState | null>(null);

export function useExchangeContext() {
  const exchange = useContext(ExchangeContext);

  if (!exchange) {
    throw new Error(
      "useExchangeContext must be used inside an ExchangeProvider"
    );
  }

  return exchange;
}
