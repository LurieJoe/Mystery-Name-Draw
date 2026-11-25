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
  BRL: "R$",
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
  /**
   * The organizer's own second way of saying the same amount, for an
   * exchange spanning two currencies: "about US$30". Free text,
   * because converting would need live rates and would be wrong by
   * the time anybody read it.
   */
  giftBudgetNote?: string | null;
}): string {
  if (budget.noGiftLimit) {
    return "No limit";
  }

  const amount = (budget.giftBudget ?? "").trim();

  if (!amount) {
    return "Not set";
  }

  const label = `${currencySymbols[budget.currency] ?? ""}${amount} ${
    budget.currency
  }`;

  // Only ever a gloss on an amount: with no limit, or no amount, both
  // branches above have already returned. This mirrors
  // gift_budget_label in the database, which the email prints.
  const note = (budget.giftBudgetNote ?? "").trim();

  return note ? `${label} (${note})` : label;
}

/**
 * When a message was sent, written the way a chat writes it.
 *
 * Unlike formatDate above, this one hands the whole string to the
 * Date constructor on purpose: a message carries a full timestamp
 * with a zone, so there is nothing to misread.
 */
export function formatMessageTime(at: string): string {
  const when = new Date(at);

  if (Number.isNaN(when.getTime())) return "";

  const clock = when.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  if (when.toDateString() === new Date().toDateString()) {
    return clock;
  }

  const day = when.toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });

  return `${day}, ${clock}`;
}
