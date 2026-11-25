/**
 * What the emails say.
 *
 * Here rather than in the Edge Function so the words are typechecked,
 * linted, and testable like anything else, and so they can be read
 * without opening a Deno file. scripts/sync-shared.cjs copies this
 * where the function can be deployed with it.
 *
 * Plain functions and plain strings: no dependencies, because this
 * runs under Deno as well as Node.
 */

export type Email = { subject: string; body: string };

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * A date as an email should write it.
 *
 * Not toLocaleDateString, which the app uses on screen: that reads
 * the locale of whatever is rendering, and in an Edge Function that
 * is a server in Virginia rather than the person holding the phone.
 * "12/16/2026" also means two different days depending on who is
 * reading it, and a draw date is exactly the wrong thing to be
 * ambiguous about.
 */
export function formatEmailDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso ?? "").trim());

  if (!match) {
    return iso ?? "";
  }

  const [, year, month, day] = match;

  return `${MONTHS[Number(month) - 1]} ${Number(day)}, ${year}`;
}

export type Personal = {
  /** What they are called, as they typed it. */
  name: string;
  exchangeName: string;
  /** Their own link, token and all. */
  link: string;
};

// --------------------------------------------------------------------
// Sign-offs
//
// Two, because these emails reach two different relationships. The
// organizer chose this app, set the exchange up, and is the person
// who would write back; hearing from a name is right for them.
// A participant joined somebody else's office party and may not know
// the exchange runs on a product at all - to them a stranger's first
// name at the bottom of an email is a puzzle, and the product name
// answers the question they are actually asking, which is what this
// is.
// --------------------------------------------------------------------

const PARTICIPANT_SIGNOFF = ["Mystery Name Draw", "mysterynamedraw.com"];

const ORGANIZER_SIGNOFF = ["Happy shopping,", "Joe", "mysterynamedraw.com"];

/**
 * The warning that goes on every email carrying a personal link.
 *
 * Said plainly and in terms of what the other person could do, not in
 * terms of security. "Treat it like a password" means nothing to
 * somebody who shares passwords; "they will see the name you drew"
 * means something to everybody.
 *
 * Deliberately avoids the word "restriction", which in this app means
 * a particular thing - who you would rather not be matched with - and
 * should not also mean "limit".
 *
 * Says nothing about the token expiring. It does, thirty days after
 * the draw, and that protects people whether or not they know about
 * it. Explaining it would add a sentence about how the app works to
 * an email that is otherwise about them.
 */
export const PERSONAL_LINK_WARNING =
  "This link is yours alone. Anyone who opens it lands on your page, " +
  "where they can see the name you drew, read your wishlist, and " +
  "change or delete anything there. So if you forward this email or " +
  "paste the link somewhere, you're handing all of that over.";

/**
 * What opting out does and does not stop.
 *
 * Said on the emails somebody can turn off, and on the page where
 * they turn them off, in the same words both times. The point is that
 * "unsubscribe" normally means silence, and here it does not: the two
 * emails they registered in order to receive still arrive, and
 * somebody who expects total silence would otherwise be surprised by
 * the one that matters most.
 */
export const REMINDERS_NOTE =
  "Not interested in nudges like this one? Turn reminders off on " +
  "your page. We'll still tell you when the draw happens and you " +
  "have a name to buy for, and when somebody in the exchange sends " +
  "you a message, because those are the ones you joined for.";

/** The same, for the screen where the choice is made. */
export const REMINDERS_OFF_CONFIRMATION =
  "Reminders are off. We'll still email you when the draw happens " +
  "and you have somebody to buy for, and when somebody sends you " +
  "message. Deadline nudges and updates stay off.";

/** The same idea for the organizer, whose link does more. */
export const MANAGEMENT_LINK_WARNING =
  "This link is how you manage this exchange, and it's the only way " +
  "in. Whoever opens it can rename the exchange, remove people, and " +
  "change the dates. They still can't see who drew whom, because " +
  "nobody can.";

/*
 * Every participant email ends on a warning about the link, which
 * reads as a telling-off rather than a goodbye. The closing goes
 * after it, so the last thing somebody reads is a human one.
 */
function compose(
  lines: string[],
  signoff: string[],
  closing?: string
): string {
  return [
    ...lines,
    ...(closing ? ["", closing] : []),
    "",
    "---",
    "",
    ...signoff,
  ].join("\n");
}

// --------------------------------------------------------------------
// To participants
// --------------------------------------------------------------------

/** You have been added to an exchange, and need to register. */
export function invitationEmail(
  details: Personal & {
    organizerName: string;
    registrationDeadline: string;
    drawDate: string;
    budget: string;
  }
): Email {
  return {
    subject: `${details.organizerName} added you to ${details.exchangeName}`,
    body: compose(
      [
        `Hi ${details.name},`,
        ``,
        `${details.organizerName} is running a gift exchange called ` +
          `${details.exchangeName}, and you're in it.`,
        ``,
        `Register here:`,
        details.link,
        ``,
        `It takes a minute, there's no account and no password, and ` +
          `what you write is a wishlist for whoever draws your name. ` +
          `They see it; you never find out who they are.`,
        ``,
        `Register by ${details.registrationDeadline}. The draw is on ` +
          `${details.drawDate}. Budget: ${details.budget}.`,
        ``,
        PERSONAL_LINK_WARNING,
      ],
      PARTICIPANT_SIGNOFF,
      "See you in the draw."
    ),
  };
}

/** The deadline is close and you have not registered. */
export function registrationReminderEmail(
  details: Personal & { registrationDeadline: string }
): Email {
  return {
    subject: `Last call: ${details.exchangeName} closes ${details.registrationDeadline}`,
    body: compose(
      [
        `Hi ${details.name},`,
        ``,
        `Registration for ${details.exchangeName} closes on ` +
          `${details.registrationDeadline}, and you aren't in yet.`,
        ``,
        `Takes a minute:`,
        details.link,
        ``,
        `If you'd rather sit this one out, you can ignore this ` +
          `and nothing happens.`,
        ``,
        PERSONAL_LINK_WARNING,
        ``,
        REMINDERS_NOTE,
      ],
      PARTICIPANT_SIGNOFF,
      "Hope you can make it."
    ),
  };
}

/**
 * Registration has closed, and the thing that opens is worth an email.
 *
 * Only sent where there is actually a window: an exchange drawing too
 * soon after its deadline has none, and promising one would be the
 * same lie the registration screens were told to stop telling.
 */
export function registrationClosedEmail(
  details: Personal & { drawDate: string; people: number }
): Email {
  return {
    subject: `${details.exchangeName}: ${details.people} people are in`,
    body: compose(
      [
        `Hi ${details.name},`,
        ``,
        `Registration for ${details.exchangeName} has closed with ` +
          `${details.people} people taking part. The draw is on ` +
          `${details.drawDate}.`,
        ``,
        `Until then you can say who you'd rather not be matched ` +
          `with. Now that the list is final, it's worth a look:`,
        details.link,
        ``,
        `These are preferences rather than guarantees. The draw ` +
          `honors every one it can, but enough of them together can ` +
          `make a draw impossible.`,
        ``,
        PERSONAL_LINK_WARNING,
        ``,
        REMINDERS_NOTE,
      ],
      PARTICIPANT_SIGNOFF,
      "Not long now."
    ),
  };
}

/** The draw is close; last chance to change anything. */
export function drawReminderEmail(
  details: Personal & { drawDate: string }
): Email {
  return {
    subject: `${details.exchangeName} draws on ${details.drawDate}`,
    body: compose(
      [
        `Hi ${details.name},`,
        ``,
        `${details.exchangeName} draws on ${details.drawDate}. After ` +
          `that, everyone has a name and nothing can be changed.`,
        ``,
        `Worth a last look at your wishlist, and at who you'd ` +
          `rather not be matched with:`,
        details.link,
        ``,
        PERSONAL_LINK_WARNING,
        ``,
        REMINDERS_NOTE,
      ],
      PARTICIPANT_SIGNOFF,
      "Nearly there."
    ),
  };
}

/** The one that matters: who you are buying for. */
export function drawResultEmail(details: Personal): Email {
  return {
    subject: `Your match for ${details.exchangeName} is ready`,
    body: compose(
      [
        `Hi ${details.name},`,
        ``,
        `The draw for ${details.exchangeName} has happened, and you ` +
          `have somebody to buy for.`,
        ``,
        `Open your page to see who:`,
        details.link,
        ``,
        `The name isn't in this email on purpose. Email gets ` +
          `forwarded, searched, and left open on screens, and this ` +
          `is the one thing in the exchange that's supposed to stay ` +
          `between you and the app.`,
        ``,
        `While you're there you can read their wishlist, see what ` +
          `they'd rather not receive, and send them a message. ` +
          `They'll know it came from whoever drew their name, but ` +
          `not that it's you.`,
        ``,
        PERSONAL_LINK_WARNING,
      ],
      PARTICIPANT_SIGNOFF,
      "Have fun with it."
    ),
  };
}

/**
 * Somebody has written to you.
 *
 * Says nothing about who, or which direction. The app shows that, in
 * the only place it can be shown safely. An email that said "the
 * person you are buying for has written" would be a small leak to
 * anyone who sees the subject line over a shoulder.
 */
export function messageWaitingEmail(details: Personal): Email {
  return {
    subject: `A message about ${details.exchangeName}`,
    body: compose(
      [
        `Hi ${details.name},`,
        ``,
        `Somebody in ${details.exchangeName} has sent you a message.`,
        ``,
        `Read it here:`,
        details.link,
        ``,
        `It only goes one way: whoever drew a name knows whose it ` +
          `is, and the person whose name was drawn never finds out ` +
          `who drew it. Replying doesn't change that either way.`,
        ``,
        PERSONAL_LINK_WARNING,
      ],
      PARTICIPANT_SIGNOFF,
      "Worth a look."
    ),
  };
}

// --------------------------------------------------------------------
// To the organizer
// --------------------------------------------------------------------

/** Registration closed: who came, and who did not. */
export function rollCallEmail(details: {
  organizerName: string;
  exchangeName: string;
  link: string;
  registered: number;
  invited: number;
  drawDate: string;
}): Email {
  const missing = details.invited - details.registered;

  return {
    subject: `${details.exchangeName}: registration closed`,
    body: compose(
      [
        `Hi ${details.organizerName},`,
        ``,
        `Registration for ${details.exchangeName} has closed. ` +
          `${details.registered} of the ${details.invited} people you ` +
          `invited registered.`,
        missing > 0
          ? `\n${missing} didn't, and won't be in the draw. If ` +
            `that's a surprise, you can reopen registration from ` +
            `your management page and tell them to try again.`
          : `\nEverybody you invited is in.`,
        ``,
        `The draw runs on ${details.drawDate}, in the morning. You ` +
          `don't have to do anything to make it happen.`,
        ``,
        `Your management page:`,
        details.link,
        ``,
        MANAGEMENT_LINK_WARNING,
      ],
      ORGANIZER_SIGNOFF
    ),
  };
}

/**
 * The draw could not be made.
 *
 * The one email that asks the organizer to do something, so it says
 * what and why rather than that something went wrong.
 */
export function drawFailedEmail(details: {
  organizerName: string;
  exchangeName: string;
  link: string;
  reason: string;
}): Email {
  return {
    subject: `${details.exchangeName} couldn't be drawn`,
    body: compose(
      [
        `Hi ${details.organizerName},`,
        ``,
        `The draw for ${details.exchangeName} ran this morning and ` +
          `couldn't produce a valid result.`,
        ``,
        details.reason,
        ``,
        `Nothing has been sent to anybody, and nobody has been ` +
          `matched. The draw will try again every hour, so fixing ` +
          `the cause is all that's needed - there's no button to ` +
          `press afterwards.`,
        ``,
        `Your management page:`,
        details.link,
        ``,
        MANAGEMENT_LINK_WARNING,
      ],
      ORGANIZER_SIGNOFF
    ),
  };
}
