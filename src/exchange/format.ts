/**
 * How dates and budgets are written on screen.
 *
 * These lived inside useExchange, which was fine while the organizer's
 * wizard was the only thing that showed them. The registration screens
 * show the same two facts to somebody who has none of that state, so
 * they are plain functions here instead of being reachable only
 * through a hook.
 */

export const currencySymbols: Record<string, string> = {
  USD: "$",
  CAD: "$",
  GBP: "£",
  EUR: "€",
  AUD: "$",
};

/**
 * An ISO date as the reader's own locale writes it.
 *
 * Split and rebuilt rather than passed to the Date constructor:
 * new Date("2026-12-25") is parsed as UTC and then displayed locally,
 * which shows the day before to anybody west of Greenwich. The parts
 * go in as local numbers, so the date that comes out is the date that
 * went in.
 */
export function formatDate(dateString: string): string {
  if (!dateString) return "Not set";

  const [year, month, day] = dateString.split("-").map(Number);

  return new Date(year, month - 1, day).toLocaleDateString();
}

export function giftBudgetLabel(budget: {
  giftBudget: string;
  currency: string;
  noGiftLimit: boolean;
}): string {
  if (budget.noGiftLimit) {
    return "No limit";
  }

  const amount = (budget.giftBudget ?? "").trim();

  if (!amount) {
    return "Not set";
  }

  return `${currencySymbols[budget.currency] ?? ""}${amount} ${
    budget.currency
  }`;
}
