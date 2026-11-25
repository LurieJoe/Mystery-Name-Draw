/**
 * Everything the registration screens ask the database for.
 *
 * The organizer's side of the app keeps one exchange in a hook and
 * sends it over the wire when it changes. Registration cannot work
 * that way: the person following the link has never seen this
 * exchange, is usually on a different device, and may never have
 * opened Mystery Name Draw before. So every screen here starts from
 * the server and holds only what it was handed back.
 *
 * Kept apart from remote.ts because the two speak for different
 * people: that module holds the organizer's token, this one holds an
 * invitee's, and nothing should make it easy to confuse them.
 */

import { rpc } from "../api/config.js";
import type { RestrictionDirection } from "./types.js";

// --------------------------------------------------------------------
// What the database hands back
// --------------------------------------------------------------------

/** What a link shows before anybody has typed anything into it. */
export type ExchangePreview = {
  name: string;
  giftBudget: string | null;
  currency: string;
  noGiftLimit: boolean;
  registrationDeadline: string;
  drawDate: string;
  organizerName: string;
  registrationOpen: boolean;
  /** False when the organizer limited it to the addresses they listed. */
  openToAnyone: boolean;
  drawn: boolean;
};

export type RegisteredPerson = {
  id: string;
  name: string;
  email: string;
  status: string;
  wishlist: string | null;
  preferences: string | null;
  unsubscribed: boolean;
};

/** One person's own view: themselves, the names, and their choices. */
export type RegistrationView = {
  exchange: {
    /** So a link that carries only a token can tell where it landed. */
    eventCode: string;
    name: string;
    giftBudget: string | null;
    currency: string;
    noGiftLimit: boolean;
    registrationDeadline: string;
    drawDate: string;
    organizerName: string;
    drawn: boolean;
  };
  registrationOpen: boolean;
  restrictionsOpen: boolean;
  me: RegisteredPerson;
  /** Names only, and only of people who registered. */
  others: { id: string; name: string }[];
  /**
   * Their own choices only. A restriction the organizer set for them
   * is honored by the draw and deliberately never sent here.
   */
  myRestrictions: { otherId: string; direction: RestrictionDirection }[];
};

export type JoinResult = {
  inviteeToken: string;
  registration: RegistrationView;
};

// --------------------------------------------------------------------
// Calls
// --------------------------------------------------------------------

export async function previewExchange(
  eventCode: string
): Promise<ExchangePreview> {
  return rpc<ExchangePreview>("exchange_preview", {
    p_event_code: eventCode,
  });
}

export async function joinExchange(fields: {
  eventCode: string;
  name: string;
  email: string;
  wishlist: string;
  preferences: string;
}): Promise<JoinResult> {
  return rpc<JoinResult>("join_exchange", {
    p_event_code: fields.eventCode,
    p_name: fields.name,
    p_email: fields.email,
    p_wishlist: emptyToNull(fields.wishlist),
    p_preferences: emptyToNull(fields.preferences),
  });
}

export async function fetchRegistration(
  inviteeToken: string
): Promise<RegistrationView> {
  return rpc<RegistrationView>("registration_view", {
    p_invitee_token: inviteeToken,
  });
}

export async function saveRegistration(fields: {
  inviteeToken: string;
  name: string;
  wishlist: string;
  preferences: string;
}): Promise<RegistrationView> {
  return rpc<RegistrationView>("register_participant", {
    p_invitee_token: fields.inviteeToken,
    p_name: fields.name,
    p_wishlist: emptyToNull(fields.wishlist),
    p_preferences: emptyToNull(fields.preferences),
  });
}

export async function setRestrictionRemotely(
  inviteeToken: string,
  otherId: string,
  direction: RestrictionDirection
): Promise<RegistrationView> {
  return rpc<RegistrationView>("set_my_restriction", {
    p_invitee_token: inviteeToken,
    p_other_id: otherId,
    p_direction: direction,
  });
}

export async function clearRestrictionRemotely(
  inviteeToken: string,
  otherId: string,
  direction: RestrictionDirection
): Promise<RegistrationView> {
  return rpc<RegistrationView>("clear_my_restriction", {
    p_invitee_token: inviteeToken,
    p_other_id: otherId,
    p_direction: direction,
  });
}

/**
 * Turn the nudges on or off.
 *
 * Opting out stops the reminders and nothing else: the email saying
 * somebody has a name to buy for, and the one saying a message is
 * waiting, still arrive. Those are the two they registered for.
 */
/**
 * The one name you are buying for, and what they wrote.
 *
 * Null until the draw has run. Deliberately a separate call rather
 * than part of registration_view: that view is fetched on every visit
 * and by people who have not been drawn for yet, and the assignment
 * is the one thing in this app that should be read only when it is
 * actually being looked at.
 */
export type Assignment = {
  name: string | null;
  wishlist?: string | null;
  preferences?: string | null;
};

export async function fetchAssignment(
  inviteeToken: string
): Promise<Assignment> {
  return rpc<Assignment>("my_assignment", {
    p_invitee_token: inviteeToken,
  });
}

// --------------------------------------------------------------------
// Messages
//
// Two threads, and which one you are in changes what you are told.
// As the giver you are writing to somebody you know, so you see their
// name. As the receiver you are writing to whoever drew you, and that
// person stays "Your Giver" forever - the whole point of the app is
// that you never find out.
// --------------------------------------------------------------------

export type ThreadRole = "giver" | "receiver";

export type ThreadMessage = {
  id: string;
  /** Which side of the thread this sits on, for styling. */
  from: "you" | "them";
  /** What the sender is called: "You", a name, or "Your Giver". */
  fromLabel: string;
  body: string;
  at: string;
};

export type Thread = {
  /** False before the draw: nobody to talk to yet. */
  available: boolean;
  /**
   * Whether the organizer has left messaging switched on. Absent on a
   * database that predates 0015, and read as true there, so the screen
   * behaves exactly as it did before the migration runs.
   */
  canSend?: boolean;
  /** Their name if you drew them, null if they drew you. */
  withName?: string | null;
  withLabel?: string;
  messages: ThreadMessage[];
};

export async function fetchThread(
  inviteeToken: string,
  as: ThreadRole
): Promise<Thread> {
  return rpc<Thread>("my_thread", {
    p_invitee_token: inviteeToken,
    p_as: as,
  });
}

export async function sendMessageRemotely(
  inviteeToken: string,
  as: ThreadRole,
  body: string
): Promise<Thread> {
  return rpc<Thread>("send_message", {
    p_invitee_token: inviteeToken,
    p_as: as,
    p_body: body,
  });
}

export async function markThreadRead(
  inviteeToken: string,
  as: ThreadRole
): Promise<void> {
  await rpc<unknown>("mark_thread_read", {
    p_invitee_token: inviteeToken,
    p_as: as,
  });
}

export async function setRemindersRemotely(
  inviteeToken: string,
  wanted: boolean
): Promise<RegistrationView> {
  return rpc<RegistrationView>("set_my_reminders", {
    p_invitee_token: inviteeToken,
    p_wanted: wanted,
  });
}

export async function withdrawRemotely(
  inviteeToken: string
): Promise<void> {
  await rpc<unknown>("withdraw_registration", {
    p_invitee_token: inviteeToken,
  });
}

/*
 * An empty box means "nothing to say", not "the empty string". The
 * column is nullable for exactly that, and the difference shows: a
 * wishlist of "" would print as a blank section rather than being
 * left out.
 */
function emptyToNull(value: string): string | null {
  const trimmed = value.trim();

  return trimmed === "" ? null : trimmed;
}

// --------------------------------------------------------------------
// Remembering who this browser is, per exchange
// --------------------------------------------------------------------

/*
 * One key per exchange rather than one blob of them all, so somebody
 * in six exchanges does not rewrite six tokens to change one, and a
 * single corrupt entry costs one link rather than all of them.
 *
 * The code is upper-cased because people retype these from an email
 * and the database matches them case-insensitively; two keys for one
 * exchange would quietly log somebody out.
 */
const inviteeKey = (eventCode: string) =>
  `mnd.invitee.${eventCode.trim().toUpperCase()}`;

export function rememberInvitee(eventCode: string, token: string) {
  try {
    window.localStorage.setItem(inviteeKey(eventCode), token);
  } catch {
    // Private browsing, a full quota, or storage switched off. They
    // stay registered either way; they just have to use their link
    // again rather than this browser recognizing them.
  }
}

export function rememberedInvitee(eventCode: string): string | null {
  try {
    return window.localStorage.getItem(inviteeKey(eventCode));
  } catch {
    return null;
  }
}

export function forgetInvitee(eventCode: string) {
  try {
    window.localStorage.removeItem(inviteeKey(eventCode));
  } catch {
    // As above.
  }
}
