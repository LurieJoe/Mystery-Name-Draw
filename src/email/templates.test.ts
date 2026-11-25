import {
  MANAGEMENT_LINK_WARNING,
  PERSONAL_LINK_WARNING,
  REMINDERS_NOTE,
  drawFailedEmail,
  drawReminderEmail,
  drawResultEmail,
  invitationEmail,
  messageWaitingEmail,
  registrationClosedEmail,
  registrationReminderEmail,
  rollCallEmail,
  type Email,
} from "./templates.js";

let failed = 0;

function check(label: string, condition: boolean) {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    console.log(`  FAIL  ${label}`);
    failed += 1;
  }
}

const LINK = "https://mysterynamedraw.com/#/me/TOKEN";
const MANAGE = "https://mysterynamedraw.com/#/manage/TOKEN";

const personal = {
  name: "Rowan",
  exchangeName: "Office Secret Santa",
  link: LINK,
};

const toParticipants: [string, Email][] = [
  ["invitation", invitationEmail({
    ...personal, organizerName: "Dana", registrationDeadline: "December 11",
    drawDate: "December 16", budget: "$25",
  })],
  ["registration reminder", registrationReminderEmail({
    ...personal, registrationDeadline: "December 11",
  })],
  ["registration closed", registrationClosedEmail({
    ...personal, drawDate: "December 16", people: 12,
  })],
  ["draw reminder", drawReminderEmail({ ...personal, drawDate: "December 16" })],
  ["draw result", drawResultEmail(personal)],
  ["message waiting", messageWaitingEmail(personal)],
];

const toOrganizer: [string, Email][] = [
  ["roll call", rollCallEmail({
    organizerName: "Dana", exchangeName: "Office Secret Santa", link: MANAGE,
    registered: 12, invited: 14, drawDate: "December 16",
  })],
  ["draw failed", drawFailedEmail({
    organizerName: "Dana", exchangeName: "Office Secret Santa", link: MANAGE,
    reason: "The restrictions leave no valid draw.",
  })],
];

const all = [...toParticipants, ...toOrganizer];

console.log("\nEmail templates:\n");

for (const [name, email] of all) {
  check(`${name} has a subject`, email.subject.trim().length > 0);
  check(`${name} names the exchange in its subject`,
    email.subject.includes("Office Secret Santa"));
  check(`${name} carries its link`, email.body.includes("mysterynamedraw.com/#/"));
}

for (const [name, email] of toParticipants) {
  check(`${name} warns what the link gives away`,
    email.body.includes(PERSONAL_LINK_WARNING));
  check(`${name} signs off as the app, not as a person`,
    email.body.trimEnd().endsWith("Mystery Name Draw\nmysterynamedraw.com"));
}

for (const [name, email] of toOrganizer) {
  check(`${name} warns what the management link gives away`,
    email.body.includes(MANAGEMENT_LINK_WARNING));
  check(`${name} signs off from Joe`,
    email.body.includes("Joe"));
}

/*
 * Only the emails somebody can actually switch off offer to switch
 * them off. Telling a person they can stop the email that tells them
 * who they drew would be a promise this app does not keep.
 */
const SWITCHABLE = new Set([
  "registration reminder", "registration closed", "draw reminder",
]);

for (const [name, email] of all) {
  const offers = email.body.includes(REMINDERS_NOTE);

  check(
    SWITCHABLE.has(name)
      ? `${name} says how to turn reminders off`
      : `${name} does not offer to stop an email that arrives anyway`,
    offers === SWITCHABLE.has(name)
  );
}

for (const [name, email] of all) {
  if (!email.body.includes(REMINDERS_NOTE)) continue;

  check(`${name} says what still arrives`,
    /draw happens/.test(email.body) && /sends you a message/.test(email.body));
}

/*
 * "Restriction" means one particular thing in this app - who you would
 * rather not be matched with - and must not also turn up meaning
 * "limit". The one exception is the failure email, which passes the
 * database's own explanation through verbatim.
 */
for (const [name, email] of all) {
  if (name === "draw failed") continue;

  check(`${name} avoids the word "restriction"`,
    !/restrict/i.test(email.body));
}

// US spelling, and no stray British forms creeping in from anywhere.
for (const [name, email] of all) {
  check(`${name} uses US spelling`,
    !/honour|colour|apologise|organis(e|ed|ing)|recognise/i.test(email.body));
}

/*
 * The drawn name never appears in an email. drawResultEmail takes no
 * parameter that could carry it, which is the real guarantee; this
 * checks the template was not later given a way to.
 */
check(
  "the draw result email cannot name who you drew",
  drawResultEmail.length === 1 &&
    !JSON.stringify(drawResultEmail(personal)).includes("Mina")
);

console.log(
  failed === 0
    ? `\nAll ${all.length} templates passed.\n`
    : `\n${failed} failed.\n`
);

if (failed > 0) process.exit(1);
