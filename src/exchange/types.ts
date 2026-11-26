/**
 * Shared types, constants, and date helpers for an exchange.
 */

export type Invitee = {
  id: string;
  name: string;
  email: string;
  status: string;
  /** What they would like. Written by them at registration, not by the organizer. */
  wishlist?: string;
  /** Sizes, interests, things to steer clear of. */
  preferences?: string;
};

export type RestrictionDirection = "give" | "receive";

/**
 * One restriction, belonging to the participant who set it.
 *
 * `ownerId` is whose choice this is, and it is only ever shown on that
 * person's own list. `direction` is read from the owner's point of view:
 *   "give"    -> owner must not be assigned to buy for `otherId`
 *   "receive" -> `otherId` must not be assigned to buy for owner
 *
 * Direction matters: an owner refusing to give to someone says nothing
 * about the reverse. Two participants can independently express the same
 * underlying constraint (Joe won't give to Evelyn; Evelyn won't receive
 * from Joe) - those stay two separate records, because they are two
 * people's choices. The draw collapses them when it builds the set of
 * forbidden giver/receiver pairs.
 */
export type Restriction = {
  ownerId: string;
  otherId: string;
  direction: RestrictionDirection;
  /**
   * True when the organizer entered it on somebody's behalf. The draw
   * honors both kinds equally; the difference is whose it is to
   * change. A person's own choice is theirs, so the organizer's
   * screen shows it without offering to undo it.
   *
   * Absent on a restriction made in the wizard before the exchange
   * exists, which has not been written anywhere yet and is read as
   * the organizer's.
   */
  setByOrganizer?: boolean;
};

// The organizer is a participant like anyone else, with a fixed id so
// restrictions naming them survive toggling "Include me" off and on.
export const ORGANIZER_ID = "organizer";

/**
 * Where the management link lands: the screen about an exchange that
 * already exists, rather than the form that creates one.
 */
export const MANAGE_STEP = 5;

export const INVITE_PENDING = "Invite Pending";
export const INVITED = "Invited";
export const REGISTERED = "Registered";

export const INVITEE_STATUSES = [INVITE_PENDING, INVITED, REGISTERED];

/**
 * Local-calendar ISO date. `toISOString()` converts to UTC first, so
 * west of Greenwich it returns tomorrow's date all evening.
 */
export const toIsoDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(date.getDate()).padStart(2, "0")}`;

/** Move an ISO date forward whole years, clamping Feb 29 to Feb 28. */
export const shiftIsoDateByYears = (value: string, years: number) => {
  if (!value || years === 0) {
    return value;
  }

  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    return value;
  }

  const targetYear = year + years;
  const lastDayOfMonth = new Date(targetYear, month, 0).getDate();

  return `${targetYear}-${String(month).padStart(2, "0")}-${String(
    Math.min(day, lastDayOfMonth)
  ).padStart(2, "0")}`;
};

export const createInviteeId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `invitee-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;

/**
 * Good enough to catch a typo. Real validation is the message arriving,
 * so this stays permissive rather than trying to encode RFC 5322.
 */
export const isValidEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
