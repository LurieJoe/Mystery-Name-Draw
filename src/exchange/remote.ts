/**
 * The shape the database wants, and where the organizer's token lives.
 *
 * Kept apart from useExchange so the mapping is a plain function with
 * tests rather than a detail inside a hook, and apart from api/rpc so
 * that module stays about HTTP.
 */

// ".js" because the draw tests compile this to ESM and run it in
// Node, which requires the extension. Vite resolves it either way.
import { ORGANIZER_ID } from "./types.js";
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
  restrictions: {
    ownerId: string;
    otherId: string;
    direction: string;
    /** True: entered by the organizer, and never shown to the person. */
    setByOrganizer: boolean;
  }[];
  /** The row the organizer's own ORGANIZER_ID stands for, if any. */
  organizerInviteeId: string | null;
  /** The database's answer, which is the one that decides who may join. */
  registrationOpen: boolean;
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

  // Captured before the invitees are filtered: once their own row is
  // taken out of the list, there is nothing left to recognize it by.
  const organizerRow = (view.invitees ?? []).find((invitee) =>
    bool(invitee.is_organizer, false)
  );

  const organizerInviteeId = organizerRow ? str(organizerRow.id) : null;

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

    /*
     * Both kinds come back, and each says which it is.
     *
     * They used to be filtered to the participants' own choices, on
     * the grounds that an organizer-set restriction speaks for
     * somebody who never chose it. That is true of the page the
     * person reads, which is built from registration_view and has
     * never carried them. It is not true here: this is the
     * organizer's own screen, and dropping them meant the editor
     * showed nothing of what the organizer had set the moment the
     * page reloaded.
     *
     * The organizer's own row is a real invitee in the database and a
     * fixed local id in the app, so it is translated at this one
     * boundary rather than in every place that reads a restriction.
     */
    restrictions: (view.restrictions ?? []).map((restriction) => ({
      ownerId: asLocalId(str(restriction.ownerId), organizerInviteeId),
      otherId: asLocalId(str(restriction.otherId), organizerInviteeId),
      direction: restriction.direction,
      setByOrganizer: Boolean(restriction.setByOrganizer),
    })),

    /** The row the organizer's own ORGANIZER_ID stands for, if any. */
    organizerInviteeId,

    registrationOpen: bool(view.registrationOpen, true),
  };
}

/**
 * The organizer is ORGANIZER_ID everywhere in the app and a uuid in
 * the database. One translation each way, here and in the hook that
 * writes, so nothing in between has to know there are two.
 */
function asLocalId(id: string, organizerInviteeId: string | null) {
  return organizerInviteeId && id === organizerInviteeId
    ? ORGANIZER_ID
    : id;
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

// --------------------------------------------------------------------
// The list, after the exchange exists
//
// Everything above this line happens once, at creation. These are the
// changes an organizer makes afterwards, which until now lived only in
// the browser that made them: the row appeared, the next page load
// read the roster back from the database, and it was gone.
// --------------------------------------------------------------------

export type AddedInvitee = {
  id: string;
  name: string;
  email: string;
  status: string;
};

export async function addInviteeRemotely(
  organizerToken: string,
  name: string,
  email: string
) {
  return rpc<AddedInvitee>("add_invitee", {
    p_organizer_token: organizerToken,
    p_name: name,
    p_email: email,
  });
}

export async function updateInviteeRemotely(
  organizerToken: string,
  inviteeId: string,
  name: string,
  email: string
) {
  return rpc<AddedInvitee & { addressChanged: boolean }>("update_invitee", {
    p_organizer_token: organizerToken,
    p_invitee_id: inviteeId,
    p_name: name,
    p_email: email,
  });
}

export async function removeInviteeRemotely(
  organizerToken: string,
  inviteeId: string
) {
  return rpc<{ removed: boolean; id: string }>("remove_invitee", {
    p_organizer_token: organizerToken,
    p_invitee_id: inviteeId,
  });
}

export type InvitationCounts = {
  /** Never sent one. */
  pending: number;
  /** Sent one, nothing back yet: who a resend is for. */
  invited: number;
  registered: number;
  /** Already in the queue, so neither button would move them. */
  waiting: number;
};

export async function invitationCountsRemotely(organizerToken: string) {
  return rpc<InvitationCounts>("invitation_counts", {
    p_organizer_token: organizerToken,
  });
}

export async function sendInvitationsRemotely(
  organizerToken: string,
  resend: boolean
) {
  return rpc<{ queued: number; skipped: number }>("send_invitations", {
    p_organizer_token: organizerToken,
    p_resend: resend,
  });
}

export async function setOrganizerRestrictionRemotely(
  organizerToken: string,
  ownerId: string,
  otherId: string,
  direction: "give" | "receive"
) {
  return rpc<{ set: boolean }>("set_organizer_restriction", {
    p_organizer_token: organizerToken,
    p_owner_id: ownerId,
    p_other_id: otherId,
    p_direction: direction,
  });
}

export async function clearOrganizerRestrictionRemotely(
  organizerToken: string,
  ownerId: string,
  otherId: string,
  direction: "give" | "receive"
) {
  return rpc<{ cleared: boolean }>("clear_organizer_restriction", {
    p_organizer_token: organizerToken,
    p_owner_id: ownerId,
    p_other_id: otherId,
    p_direction: direction,
  });
}

export async function setRegistrationOpenRemotely(
  organizerToken: string,
  open: boolean
) {
  return rpc<{ open: boolean; deadlinePassed: boolean }>(
    "set_registration_open",
    { p_organizer_token: organizerToken, p_open: open }
  );
}

export async function regenerateEventCodeRemotely(organizerToken: string) {
  return rpc<{ eventCode: string }>("regenerate_event_code", {
    p_organizer_token: organizerToken,
  });
}

export async function updateExchangeRemotely(
  organizerToken: string,
  payload: Record<string, unknown>
) {
  return rpc<Record<string, unknown>>("update_exchange", {
    p_organizer_token: organizerToken,
    p_payload: payload,
  });
}
