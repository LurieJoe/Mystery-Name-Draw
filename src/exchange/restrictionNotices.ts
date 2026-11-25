/**
 * The words the organizer sees when a restriction is removed.
 *
 * Restrictions come from two places and both are honoured: a participant
 * sets their own, and the organizer can set one on anyone's behalf, in
 * case somebody forgets. That makes the removal notice conditional. The
 * organizer must be told to notify the people whose own choice is being
 * overridden, and must not be told to notify themselves about a
 * restriction they set and are now removing.
 *
 * Kept free of React so it can be tested directly.
 */

import { ORGANIZER_ID, type Restriction } from "./types.js";

/** "Rowan", "Rowan and Mina", "Rowan, Mina, and Theo" - with the Oxford comma. */
export function formatList(names: string[]): string {
  if (names.length <= 1) {
    return names[0] ?? "";
  }

  if (names.length === 2) {
    return `${names[0]} and ${names[1]}`;
  }

  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

export type RemovalOwners = {
  /** Participants whose own choice this was, named once each. */
  participants: string[];
  /** Whether the organizer set one of these themselves. */
  fromOrganizer: boolean;
};

export function removalOwners(
  records: Restriction[],
  nameOf: (id: string) => string
): RemovalOwners {
  const participants: string[] = [];
  let fromOrganizer = false;

  for (const record of records) {
    if (record.ownerId === ORGANIZER_ID) {
      fromOrganizer = true;
      continue;
    }

    const name = nameOf(record.ownerId);

    if (!participants.includes(name)) {
      participants.push(name);
    }
  }

  return { participants, fromOrganizer };
}

/** The confirmation shown before anything is removed. */
export function removalConfirmation(
  owners: RemovalOwners,
  count: number,
  giverName: string,
  receiverName: string
): string {
  const who = formatList([
    ...(owners.fromOrganizer ? ["you"] : []),
    ...owners.participants,
  ]);

  const preamble =
    count > 1
      ? `${who.charAt(0).toUpperCase()}${who.slice(
          1
        )} each set a restriction on this pairing, and all of them will be removed.\n\n`
      : "";

  return (
    "Remove this restriction?\n\n" +
    preamble +
    `${giverName} could then be assigned to buy for ${receiverName}.`
  );
}

/**
 * What the organizer is told afterwards.
 *
 * Nobody is asked to notify a participant about a restriction that
 * participant never knew existed, which is why a removal of the
 * organizer's own restriction says so plainly instead.
 */
export function removalNotice(
  owners: RemovalOwners,
  count: number,
  giverName: string,
  receiverName: string
): string {
  const consequence = `${giverName} may now be assigned to buy for ${receiverName}.`;

  if (owners.participants.length === 0) {
    return (
      `Removed the restriction you set yourself. ${consequence} ` +
      "Nobody else set this one, so there is nobody to tell."
    );
  }

  const what = count > 1 ? "the restrictions" : "the restriction";

  return (
    `Removed ${what} on this pairing. ` +
    `Please let ${formatList(owners.participants)} know: ${consequence}`
  );
}
