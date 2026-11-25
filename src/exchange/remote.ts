/**
 * The shape the database wants, and where the organizer's token lives.
 *
 * Kept apart from useExchange so the mapping is a plain function with
 * tests rather than a detail inside a hook, and apart from api/rpc so
 * that module stays about HTTP.
 */

import { rpc } from "../api/config";

export type CreatePayload = {
  name: string;
  giftBudget: string;
  currency: string;
  noGiftLimit: boolean;
  registrationDeadline: string;
  drawDate: string;
  timeZone: string;
  remindBeforeRegistrationDeadline: boolean;
  remindBeforeDrawDate: boolean;
  organizer: { name: string; email: string; participating: boolean };
  invitees: { name: string; email: string }[];
};

export type CreatedExchange = {
  exchangeId: string;
  eventCode: string;
  organizerToken: string;
  invitees: { id: string; email: string; token: string }[];
};

/**
 * The organizer's time zone, captured once when the exchange is made.
 *
 * Every deadline here is a calendar date, and a calendar date only
 * means something in a place. The server runs in UTC, so left to itself
 * it would roll over to the next day at seven in the evening in
 * Massachusetts.
 */
export function currentTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Everything the exchange needs, from what the wizard collected. */
export function toCreatePayload(
  snapshot: {
    eventName: string;
    drawDate: string;
    registrationDeadline: string;
    giftBudget: string;
    currency: string;
    noGiftLimit: boolean;
    remindBeforeRegistrationDeadline: boolean;
    remindBeforeDrawDate: boolean;
    organizer: { name: string; email: string; participating: boolean };
    invitees: { name: string; email: string }[];
  },
  timeZone: string
): CreatePayload {
  return {
    name: snapshot.eventName.trim(),
    giftBudget: snapshot.giftBudget.trim(),
    currency: snapshot.currency,
    noGiftLimit: snapshot.noGiftLimit,
    registrationDeadline: snapshot.registrationDeadline,
    drawDate: snapshot.drawDate,
    timeZone,
    remindBeforeRegistrationDeadline:
      snapshot.remindBeforeRegistrationDeadline,
    remindBeforeDrawDate: snapshot.remindBeforeDrawDate,
    organizer: {
      name: snapshot.organizer.name.trim(),
      email: snapshot.organizer.email.trim(),
      participating: snapshot.organizer.participating,
    },
    // The organizer is added as a participant by the database when they
    // are taking part, so sending them here as well would make two of
    // them.
    invitees: snapshot.invitees
      .filter((invitee) => invitee.email.trim() !== "")
      .map((invitee) => ({
        name: invitee.name.trim(),
        email: invitee.email.trim(),
      })),
  };
}

export async function createExchangeRemotely(
  payload: CreatePayload
): Promise<CreatedExchange> {
  return rpc<CreatedExchange>("create_exchange", { p_payload: payload });
}

export async function organizerView(organizerToken: string) {
  return rpc<Record<string, unknown>>("organizer_view", {
    p_organizer_token: organizerToken,
  });
}

// --------------------------------------------------------------------
// Remembering which exchange this browser made
// --------------------------------------------------------------------

/*
 * The organizer's token is the only way back into an exchange, so it is
 * kept where this browser will find it again. That is not durable: a
 * cleared browser or a different device loses it, which is why the
 * management link exists as well.
 */
const ORGANIZER_KEY = "mnd.organizer";

type RememberedOrganizer = { eventCode: string; token: string };

export function rememberOrganizer(entry: RememberedOrganizer) {
  try {
    window.localStorage.setItem(ORGANIZER_KEY, JSON.stringify(entry));
  } catch {
    // Private browsing, a full quota, or storage switched off. Losing
    // the shortcut back is survivable; failing to create the exchange
    // over it is not.
  }
}

export function rememberedOrganizer(): RememberedOrganizer | null {
  try {
    const raw = window.localStorage.getItem(ORGANIZER_KEY);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<RememberedOrganizer>;

    return parsed.eventCode && parsed.token
      ? { eventCode: parsed.eventCode, token: parsed.token }
      : null;
  } catch {
    return null;
  }
}

export function forgetOrganizer() {
  try {
    window.localStorage.removeItem(ORGANIZER_KEY);
  } catch {
    // As above.
  }
}
