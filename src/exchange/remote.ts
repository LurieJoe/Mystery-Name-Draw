/**
 * The shape the database wants, and where the organizer's token lives.
 *
 * Kept apart from useExchange so the mapping is a plain function with
 * tests rather than a detail inside a hook, and apart from api/rpc so
 * that module stays about HTTP.
 */

// ".js" because the draw tests compile this to ESM and run it in
// Node, which requires the extension. Vite resolves it either way.
import { rpc } from "../api/config.js";

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

// --------------------------------------------------------------------
// Reading an exchange back
// --------------------------------------------------------------------

/**
 * What organizer_view returns, in the shapes the database uses.
 *
 * The exchange is a table row turned to JSON, so its keys are the
 * column names; the restrictions are built by hand in SQL and are not.
 * Converting here keeps that seam in one place instead of spreading
 * snake_case through the app.
 */
export type OrganizerViewShape = {
  exchange?: Record<string, unknown>;
  registrationOpen?: boolean;
  restrictionsOpen?: boolean;
  invitees?: Record<string, unknown>[];
  restrictions?: {
    ownerId: string;
    otherId: string;
    direction: string;
    setByOrganizer?: boolean;
  }[];
};

export type RestoredExchange = {
  eventName: string;
  eventCode: string;
  giftBudget: string;
  currency: string;
  noGiftLimit: boolean;
  registrationDeadline: string;
  drawDate: string;
  allowOpenJoin: boolean;
  remindBeforeRegistrationDeadline: boolean;
  remindBeforeDrawDate: boolean;
  organizerName: string;
  organizerEmail: string;
  includeOrganizer: boolean;
  invitees: {
    id: string;
    name: string;
    email: string;
    status: string;
    wishlist: string;
    preferences: string;
  }[];
  restrictions: { ownerId: string; otherId: string; direction: string }[];
};

const str = (value: unknown, fallback = "") =>
  typeof value === "string" ? value : fallback;

const bool = (value: unknown, fallback: boolean) =>
  typeof value === "boolean" ? value : fallback;

/** A date column arrives as "2026-12-16" or null. */
const isoDate = (value: unknown) => str(value).slice(0, 10);

export function fromOrganizerView(
  view: OrganizerViewShape
): RestoredExchange {
  const exchange = view.exchange ?? {};

  return {
    eventName: str(exchange.name),
    eventCode: str(exchange.event_code),
    giftBudget: str(exchange.gift_budget),
    currency: str(exchange.currency, "USD"),
    noGiftLimit: bool(exchange.no_gift_limit, false),
    registrationDeadline: isoDate(exchange.registration_deadline),
    drawDate: isoDate(exchange.draw_date),
    allowOpenJoin: bool(exchange.allow_open_join, true),
    remindBeforeRegistrationDeadline: bool(
      exchange.remind_before_registration_deadline,
      false
    ),
    remindBeforeDrawDate: bool(exchange.remind_before_draw_date, false),
    organizerName: str(exchange.organizer_name),
    organizerEmail: str(exchange.organizer_email),
    includeOrganizer: bool(exchange.organizer_participates, true),

    // The organizer's own row is not an invitee in the app's sense:
    // the wizard keeps them in their own fields, and listing them
    // again would show them twice.
    invitees: (view.invitees ?? [])
      .filter((invitee) => !bool(invitee.is_organizer, false))
      .map((invitee) => ({
        id: str(invitee.id),
        name: str(invitee.name),
        email: str(invitee.email),
        status: str(invitee.status, "Invite Pending"),
        wishlist: str(invitee.wishlist),
        preferences: str(invitee.preferences),
      })),

    // An organizer-set restriction speaks for somebody who never chose
    // it. The draw honours it; the person's own list must not show it,
    // and the app's restriction state is that list.
    restrictions: (view.restrictions ?? [])
      .filter((restriction) => !restriction.setByOrganizer)
      .map((restriction) => ({
        ownerId: restriction.ownerId,
        otherId: restriction.otherId,
        direction: restriction.direction,
      })),
  };
}

export async function setOpenJoinRemotely(
  organizerToken: string,
  allowed: boolean
) {
  return rpc<Record<string, unknown>>("set_open_join", {
    p_organizer_token: organizerToken,
    p_allowed: allowed,
  });
}
