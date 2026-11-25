/**
 * Tests for the draw engine. Run with: npm run test:draw
 *
 * No test framework on purpose - this module has no dependencies, and
 * neither does checking it.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  distinctForbiddenPairings,
  findAssignment,
  permittedRecipients,
  suggestedRemovals,
  createSeededRandom,
  type DrawPerson,
  type DrawResult,
  type ForbiddenPairing,
} from "./assignment.js";
import {
  formatList,
  removalConfirmation,
  removalNotice,
  removalOwners,
} from "../exchange/restrictionNotices.js";
import { ORGANIZER_ID, type Restriction } from "../exchange/types.js";
import { matchManageToken, shouldScrollToTop } from "../router.js";
import { createRpc, RpcError } from "../api/rpc.js";
import { fromOrganizerView, toCreatePayload } from "../exchange/remote.js";
import {
  csvNamesForEditing,
  flipSurnameFirst,
  parseCsvNames,
  toCsvNames,
} from "./csv.js";
import {
  makeGroups,
  makeMutualPairs,
  parseNames,
  shuffle,
} from "./grouping.js";

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label} ${detail}`);
  }
}

type Fixture = { people: DrawPerson[]; forbidden: ForbiddenPairing[] };

function loadFixture(file: string): Fixture {
  const raw = JSON.parse(
    readFileSync(join(process.cwd(), "docs", "samples", file), "utf8")
  );

  const people: DrawPerson[] = [];

  if (raw.organizer?.participating) {
    people.push({ id: "organizer", name: raw.organizer.name });
  }

  for (const invitee of raw.invitees) {
    if (invitee.status === "Registered") {
      people.push({ id: invitee.id, name: invitee.name });
    }
  }

  const forbidden: ForbiddenPairing[] = raw.restrictions.map(
    (restriction: {
      ownerId: string;
      otherId: string;
      direction: string;
    }) =>
      restriction.direction === "give"
        ? {
            giverId: restriction.ownerId,
            receiverId: restriction.otherId,
          }
        : {
            giverId: restriction.otherId,
            receiverId: restriction.ownerId,
          }
  );

  return { people, forbidden };
}

/** Is this result a complete, legal draw? Returns a reason if not. */
function invalidReason(
  people: DrawPerson[],
  forbidden: ForbiddenPairing[],
  result: DrawResult
): string | null {
  if (!result.ok) {
    return "not ok";
  }

  const { assignments } = result;

  if (assignments.length !== people.length) {
    return `wrong count ${assignments.length}`;
  }

  if (new Set(assignments.map((a) => a.giverId)).size !== people.length) {
    return "a giver appears twice";
  }

  if (
    new Set(assignments.map((a) => a.receiverId)).size !== people.length
  ) {
    return "a receiver appears twice";
  }

  if (assignments.some((a) => a.giverId === a.receiverId)) {
    return "someone drew themselves";
  }

  const blocked = new Set(
    forbidden.map((f) => `${f.giverId}|${f.receiverId}`)
  );

  const violation = assignments.find((a) =>
    blocked.has(`${a.giverId}|${a.receiverId}`)
  );

  return violation
    ? `used forbidden pairing ${violation.giverId}->${violation.receiverId}`
    : null;
}

console.log("\n1. Unrestricted draws of various sizes");
for (const size of [2, 3, 5, 12, 40]) {
  const people = Array.from({ length: size }, (_, i) => ({
    id: `p${i}`,
    name: `P${i}`,
  }));

  const reason = invalidReason(people, [], findAssignment(people, []));
  check(`${size} people`, reason === null, reason ?? "");
}

console.log("\n2. Solvable fixture, 500 randomised runs");
{
  const { people, forbidden } = loadFixture("sample-exchange.json");
  const seen = new Set<string>();
  let reason: string | null = null;

  for (let run = 0; run < 500; run += 1) {
    const result = findAssignment(people, forbidden);
    reason = invalidReason(people, forbidden, result);

    if (reason) {
      break;
    }

    if (result.ok) {
      seen.add(
        result.assignments
          .map((a) => `${a.giverId}>${a.receiverId}`)
          .sort()
          .join(",")
      );
    }
  }

  check("every run is a legal draw", reason === null, reason ?? "");
  check("runs differ from each other", seen.size > 1, `${seen.size}`);

  const distinct = distinctForbiddenPairings(people, forbidden);
  check(
    "10 restriction records collapse to 9 pairings",
    distinct.length === 9,
    `${distinct.length}`
  );
  check(
    "no work needed",
    suggestedRemovals(people, forbidden).status === "already-possible"
  );
}

console.log("\n3. Impossible fixture");
{
  const { people, forbidden } = loadFixture(
    "impossible-draw-example.json"
  );
  const nameOf = (id: string) =>
    people.find((person) => person.id === id)?.name ?? id;

  const result = findAssignment(people, forbidden);
  check("reported impossible", !result.ok);

  if (!result.ok) {
    console.log(
      `        ${result.blockedGiverIds
        .map(nameOf)
        .join(", ")} can only be matched to ${result.availableReceiverIds
        .map(nameOf)
        .join(", ")}`
    );
    check(
      "blocking set outnumbers its options",
      result.blockedGiverIds.length > result.availableReceiverIds.length
    );
  }

  let falseSuccess = false;
  for (let run = 0; run < 300; run += 1) {
    if (findAssignment(people, forbidden).ok) {
      falseSuccess = true;
    }
  }
  check("never falsely succeeds over 300 runs", !falseSuccess);

  const suggestion = suggestedRemovals(people, forbidden);
  check("offers removals", suggestion.status === "remove");

  if (suggestion.status === "remove") {
    check(
      "one removal is not enough here",
      suggestion.size === 2,
      `size ${suggestion.size}`
    );

    const allWork = suggestion.options.every((option) => {
      let remaining = forbidden;

      for (const pairing of option) {
        remaining = remaining.filter(
          (f) =>
            !(
              f.giverId === pairing.giverId &&
              f.receiverId === pairing.receiverId
            )
        );
      }

      return findAssignment(people, remaining).ok;
    });

    check("every suggested set makes the draw possible", allWork);
  }
}

console.log("\n4. A case where one removal is enough");
{
  const people: DrawPerson[] = [
    { id: "a", name: "A" },
    { id: "b", name: "B" },
    { id: "c", name: "C" },
  ];
  const forbidden: ForbiddenPairing[] = [
    { giverId: "a", receiverId: "b" },
    { giverId: "b", receiverId: "a" },
  ];

  check("impossible as set up", !findAssignment(people, forbidden).ok);

  const suggestion = suggestedRemovals(people, forbidden);
  check(
    "a single removal suffices",
    suggestion.status === "remove" && suggestion.size === 1
  );
  check(
    "both single removals offered",
    suggestion.status === "remove" && suggestion.options.length === 2
  );
}

console.log("\n5. Edge cases");
{
  const two: DrawPerson[] = [
    { id: "a", name: "A" },
    { id: "b", name: "B" },
  ];
  const three: DrawPerson[] = [
    ...two,
    { id: "c", name: "C" },
  ];

  check("two people, unrestricted", findAssignment(two, []).ok);
  check(
    "two people, one pairing blocked, is impossible",
    !findAssignment(two, [{ giverId: "a", receiverId: "b" }]).ok
  );
  check("one person is impossible", !findAssignment([two[0]], []).ok);
  check("nobody is impossible", !findAssignment([], []).ok);
  check(
    "self-pairings in the input are ignored",
    distinctForbiddenPairings(three, [
      { giverId: "a", receiverId: "a" },
    ]).length === 0
  );
  check(
    "pairings naming outsiders are ignored",
    distinctForbiddenPairings(three, [
      { giverId: "a", receiverId: "nobody" },
    ]).length === 0
  );
  check(
    "nobody is permitted to draw themselves",
    !permittedRecipients(three, []).get("a")?.includes("a")
  );
}


console.log("\n6. Seeded randomness");
{
  const people: DrawPerson[] = Array.from({ length: 8 }, (_, i) => ({
    id: `p${i}`,
    name: `P${i}`,
  }));

  const render = () =>
    JSON.stringify(
      findAssignment(people, [], createSeededRandom("same-seed"))
    );

  check("same seed gives the same draw", render() === render());

  const other = JSON.stringify(
    findAssignment(people, [], createSeededRandom("other-seed"))
  );

  check("a different seed gives a different draw", render() !== other);
}


console.log("\n7. Grouping and pairing");
{
  const people = (n: number): DrawPerson[] =>
    Array.from({ length: n }, (_, i) => ({
      id: `p${i}`,
      name: `P${i}`,
    }));

  const everyoneOnce = (groups: DrawPerson[][], n: number) => {
    const ids = groups.flat().map((p) => p.id);
    return ids.length === n && new Set(ids).size === n;
  };

  const sizes = (groups: DrawPerson[][]) =>
    groups.map((g) => g.length).sort((a, b) => b - a);

  for (const [n, size, expected] of [
    [10, 3, [4, 3, 3]],
    [9, 3, [3, 3, 3]],
    [7, 3, [4, 3]],
    [4, 3, [4]],
    [12, 4, [4, 4, 4]],
    [5, 2, [3, 2]],
  ] as [number, number, number[]][]) {
    const groups = makeGroups(people(n), size);
    const got = sizes(groups);
    check(
      `${n} people in groups of ${size} -> ${expected.join(", ")}`,
      JSON.stringify(got) === JSON.stringify(expected) &&
        everyoneOnce(groups, n),
      `got ${got.join(", ")}`
    );
  }

  check(
    "no group is ever left with one person",
    [5, 7, 9, 11, 13, 25].every((n) =>
      [2, 3, 4, 5].every((s) =>
        makeGroups(people(n), s).every((g) => g.length > 1)
      )
    )
  );

  check(
    "six people pair into three twos",
    JSON.stringify(sizes(makeMutualPairs(people(6)))) ===
      JSON.stringify([2, 2, 2])
  );
  check(
    "seven people give one trio, not a leftover",
    JSON.stringify(sizes(makeMutualPairs(people(7)))) ===
      JSON.stringify([3, 2, 2])
  );
  check("two people make one pair", sizes(makeMutualPairs(people(2)))[0] === 2);
  check("one person makes no pair to speak of", makeMutualPairs(people(1)).length === 1);
  check("nobody makes nothing", makeMutualPairs([]).length === 0);

  check(
    "shuffling keeps everyone",
    everyoneOnce([shuffle(people(20), Math.random)], 20)
  );
}

console.log("\n8. Reading a pasted list");
{
  const parsed = parseNames("  Rowan \n\nMina,Theo\n  \nNadia  Reyes ");
  check(
    "trims, splits on newlines and commas, drops blanks",
    parsed.map((p) => p.name).join("|") ===
      "Rowan|Mina|Theo|Nadia Reyes",
    parsed.map((p) => p.name).join("|")
  );

  const dupes = parseNames("Chris\nChris\nChristine\nchris");
  check(
    "repeats are numbered, and a longer name is not mistaken for one",
    dupes.map((p) => p.name).join("|") ===
      "Chris|Chris (2)|Christine|chris (3)",
    dupes.map((p) => p.name).join("|")
  );
  check("ids are unique", new Set(dupes.map((p) => p.id)).size === 4);
  check("an empty box gives nobody", parseNames("   \n  ").length === 0);
}

{
  console.log("\n9. Reading and writing a CSV of names");

  const gradebook =
    "Student Name,ID,Email\n" +
    '"Hale, Rowan",1001,rowan@example.edu\n' +
    "Mina Okafor,1002,mina@example.edu\n" +
    "Theo Barnes,1003,theo@example.edu\n";

  const fromGradebook = parseCsvNames(gradebook);
  check(
    "the heading row is dropped and the first column wins",
    fromGradebook.join("|") === "Hale, Rowan|Mina Okafor|Theo Barnes",
    fromGradebook.join("|")
  );

  check(
    "a plain text list needs no commas at all",
    parseCsvNames("Rowan\nMina\nTheo").join("|") === "Rowan|Mina|Theo"
  );

  check(
    "a name that merely looks like a heading is kept when it is not first",
    parseCsvNames("Rowan\nName\nMina").join("|") === "Rowan|Name|Mina",
    parseCsvNames("Rowan\nName\nMina").join("|")
  );

  check(
    "CRLF line endings do not produce empty rows",
    parseCsvNames("Name\r\nRowan\r\nMina\r\n").join("|") === "Rowan|Mina",
    parseCsvNames("Name\r\nRowan\r\nMina\r\n").join("|")
  );

  check(
    "a doubled quote inside a quoted cell is one quote",
    parseCsvNames('"Rowan ""Ro"" Hale",1001').join("|") ===
      'Rowan "Ro" Hale',
    parseCsvNames('"Rowan ""Ro"" Hale",1001').join("|")
  );

  check(
    "a leading byte order mark does not stick to the first name",
    parseCsvNames("\uFEFFRowan\nMina")[0] === "Rowan",
    parseCsvNames("\uFEFFRowan\nMina")[0]
  );

  check("blank rows are skipped", parseCsvNames("Rowan\n\n\nMina").length === 2);
  check("an empty file gives nobody", parseCsvNames("").length === 0);

  const written = toCsvNames(['Hale, Rowan', 'Rowan "Ro"', "Mina"]);
  check(
    "a name with a comma or a quote is quoted on the way out",
    written === 'Name\n"Hale, Rowan"\n"Rowan ""Ro"""\nMina',
    JSON.stringify(written)
  );

  check(
    "what is written reads back unchanged",
    parseCsvNames(written).join("|") === 'Hale, Rowan|Rowan "Ro"|Mina',
    parseCsvNames(written).join("|")
  );

  const everyName = ["Rowan", "Mina", "Theo"];
  check(
    "a round trip survives the draw's own parser too",
    parseNames(parseCsvNames(toCsvNames(everyName)).join("\n"))
      .map((person) => person.name)
      .join("|") === "Rowan|Mina|Theo"
  );
}

{
  console.log("\n10. A surname-first cell is not two students");

  check(
    "a surname-first name is flipped",
    flipSurnameFirst("Hale, Rowan") === "Rowan Hale"
  );
  check(
    "a suffix is left where it is",
    flipSurnameFirst("Smith, Jr.") === "Smith, Jr."
  );
  check(
    "a plain name is untouched",
    flipSurnameFirst("Rowan Hale") === "Rowan Hale"
  );
  check(
    "a cell with two commas is left alone rather than guessed at",
    flipSurnameFirst("Hale, Rowan, Rowan") === "Hale, Rowan, Rowan"
  );

  const imported = csvNamesForEditing(
    'Student Name,ID\n"Hale, Rowan",1\n"Okafor, Mina",2\n'
  );
  check(
    "a gradebook import arrives first-name-first",
    imported.join("|") === "Rowan Hale|Mina Okafor",
    imported.join("|")
  );

  // The bug this exists to prevent: the paste box splits on commas, so
  // an unflipped cell would be drawn as two people.
  const asDrawn = parseNames(imported.join("\n"));
  check(
    "two students import as two people, not four",
    asDrawn.length === 2,
    `got ${asDrawn.length}`
  );
  check(
    "and an unflipped cell really would have been four",
    parseNames('Hale, Rowan\nOkafor, Mina').length === 4
  );
}

{
  console.log("\n11. Who gets told when a restriction is removed");

  const nameOf = (id: string) =>
    ({ a: "Rowan", b: "Mina", organizer: "Joe" })[id] ?? id;

  const give = (ownerId: string, otherId: string): Restriction => ({
    ownerId,
    otherId,
    direction: "give",
  });

  check(
    "names are listed with the Oxford comma",
    formatList(["Rowan", "Mina", "Theo"]) === "Rowan, Mina, and Theo",
    formatList(["Rowan", "Mina", "Theo"])
  );
  check("two names take no comma", formatList(["Rowan", "Mina"]) === "Rowan and Mina");

  // The organizer sets one on someone's behalf, in case they forget.
  const organizerOnly = removalOwners([give(ORGANIZER_ID, "b")], nameOf);
  check(
    "an organizer-set restriction names no participant to notify",
    organizerOnly.participants.length === 0 && organizerOnly.fromOrganizer
  );

  const notice = removalNotice(organizerOnly, 1, "Rowan", "Mina");
  check(
    "and the organizer is not told to notify themselves",
    !notice.includes("Please let") && notice.includes("nobody to tell"),
    notice
  );
  check(
    "the organizer is still told what it now allows",
    notice.includes("Rowan may now be assigned to buy for Mina")
  );

  const participantOnly = removalOwners([give("a", "b")], nameOf);
  check(
    "a participant's own restriction names them",
    removalNotice(participantOnly, 1, "Rowan", "Mina").includes(
      "Please let Rowan know"
    ),
    removalNotice(participantOnly, 1, "Rowan", "Mina")
  );

  // Both set the same one: the participant still has to be told.
  const both = removalOwners([give("a", "b"), give(ORGANIZER_ID, "b")], nameOf);
  const bothNotice = removalNotice(both, 2, "Rowan", "Mina");
  check(
    "when both set it, the participant is named and the organizer is not",
    bothNotice.includes("Please let Rowan know") && !bothNotice.includes("Joe"),
    bothNotice
  );

  check(
    "the confirmation says it is yours when only you set it",
    removalConfirmation(organizerOnly, 1, "Rowan", "Mina").includes(
      "Rowan could then be assigned to buy for Mina"
    )
  );
  check(
    "the confirmation counts both when both set it",
    removalConfirmation(both, 2, "Rowan", "Mina").includes(
      "You and Rowan each set a restriction"
    ),
    removalConfirmation(both, 2, "Rowan", "Mina")
  );
}

{
  console.log("\n12. Landing at the top of a new page");

  check(
    "following a route link starts at the top",
    shouldScrollToTop("/", "/quick")
  );
  check(
    "including back to the landing page",
    shouldScrollToTop("/quick", "/")
  );
  check(
    "a link to a section of this page keeps its place",
    !shouldScrollToTop("/", "how-it-works"),
    "#how-it-works must still scroll to the section"
  );
  check(
    "and leaving that section for a route still goes to the top",
    shouldScrollToTop("how-it-works", "/quick")
  );
  check(
    "clicking the link for the page you are on does nothing",
    !shouldScrollToTop("/quick", "/quick")
  );
  check(
    "a registration link starts at the top",
    shouldScrollToTop("/", "/event/ABC123")
  );
}

{
  console.log("\n13. Talking to the database");

  // A fetch that answers from memory: the client is checkable without
  // a network, a browser, or a project that might be asleep.
  const fakeFetch = (reply: {
    status: number;
    body: string;
    onCall?: (url: string, init: RequestInit) => void;
  }) =>
    (async (url: string, init: RequestInit) => {
      reply.onCall?.(url, init);
      return {
        ok: reply.status >= 200 && reply.status < 300,
        status: reply.status,
        text: async () => reply.body,
      };
    }) as unknown as typeof fetch;

  let seenUrl = "";
  let seenInit: RequestInit = {};

  const rpc = createRpc({
    url: "https://example.supabase.co/",
    key: "sb_publishable_test",
    fetchImpl: fakeFetch({
      status: 200,
      body: JSON.stringify({ awake: true }),
      onCall: (url, init) => {
        seenUrl = url;
        seenInit = init;
      },
    }),
  });

  const result = await rpc<{ awake: boolean }>("ping");

  check("a call reaches the function it names", seenUrl === "https://example.supabase.co/rest/v1/rpc/ping", seenUrl);
  check("a trailing slash on the url does not double up", !seenUrl.includes("//rest"));
  check("it is a POST", seenInit.method === "POST");

  const headers = seenInit.headers as Record<string, string>;
  check("the key goes in the apikey header, spelled exactly", headers.apikey === "sb_publishable_test");
  check("and in Authorization as a bearer token", headers.Authorization === "Bearer sb_publishable_test");
  check("arguments default to an empty object, not nothing", seenInit.body === "{}");
  check("the answer comes back parsed", result.awake === true);

  // A refusal from the database.
  const refusing = createRpc({
    url: "https://example.supabase.co",
    key: "k",
    fetchImpl: fakeFetch({
      status: 404,
      body: JSON.stringify({ message: "No invitation for that link", code: "P0002" }),
    }),
  });

  let refused: unknown = null;
  try {
    await refusing("registration_view", { p_invitee_token: "nope" });
  } catch (error) {
    refused = error;
  }

  check("a refusal throws", refused instanceof RpcError);
  check(
    "and keeps the database's own words, which are written for a person",
    (refused as RpcError).message === "No invitation for that link",
    String((refused as RpcError).message)
  );
  check("with the sqlstate for code that wants to branch on it", (refused as RpcError).code === "P0002");
  check("a refusal is not unreachable", !(refused as RpcError).unreachable);

  // Nothing answering at all: offline, or a paused project.
  const dead = createRpc({
    url: "https://example.supabase.co",
    key: "k",
    fetchImpl: (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch,
  });

  let unreachable: unknown = null;
  try {
    await dead("ping");
  } catch (error) {
    unreachable = error;
  }

  check("nothing answering is told apart from being refused", (unreachable as RpcError).unreachable);
  check(
    "and says something a person can act on",
    (unreachable as RpcError).message.includes("Could not reach"),
    (unreachable as RpcError).message
  );

  // PostgREST does not always return JSON; a gateway might not either.
  const garbled = createRpc({
    url: "https://example.supabase.co",
    key: "k",
    fetchImpl: fakeFetch({ status: 502, body: "<html>Bad Gateway</html>" }),
  });

  let gatewayError: unknown = null;
  try {
    await garbled("ping");
  } catch (error) {
    gatewayError = error;
  }

  check("a non-JSON failure does not crash the parser", gatewayError instanceof RpcError);
  check("and reports its status", (gatewayError as RpcError).status === 502);
}

{
  console.log("\n14. Between the app's shape and the database's");

  const payload = toCreatePayload(
    {
      eventName: "  Office Secret Santa  ",
      drawDate: "2026-12-16",
      registrationDeadline: "2026-12-11",
      giftBudget: " 25 ",
      currency: "USD",
      noGiftLimit: false,
      remindBeforeRegistrationDeadline: true,
      remindBeforeDrawDate: false,
      organizer: { name: " Joe ", email: " joe@example.com ", participating: true },
      invitees: [
        { name: " Rowan ", email: " rowan@example.com " },
        { name: "No address", email: "   " },
      ],
    },
    "America/New_York"
  );

  check("what people type gets trimmed on the way out", payload.name === "Office Secret Santa" && payload.giftBudget === "25");
  check("and so do the organizer's own fields", payload.organizer.email === "joe@example.com");
  check(
    "a half-typed invitee with no address is not sent",
    payload.invitees.length === 1 && payload.invitees[0].email === "rowan@example.com",
    JSON.stringify(payload.invitees)
  );
  check("the time zone travels with the exchange", payload.timeZone === "America/New_York");

  // Coming back the other way.
  const restored = fromOrganizerView({
    exchange: {
      name: "Office Secret Santa",
      event_code: "ABC123",
      gift_budget: "25",
      currency: "USD",
      no_gift_limit: false,
      registration_deadline: "2026-12-11",
      draw_date: "2026-12-16",
      allow_open_join: false,
      remind_before_registration_deadline: true,
      remind_before_draw_date: false,
      organizer_name: "Joe",
      organizer_email: "joe@example.com",
      organizer_participates: true,
    },
    invitees: [
      { id: "org", name: "Joe", email: "joe@example.com", status: "Registered", is_organizer: true },
      { id: "a", name: "Rowan", email: "rowan@example.com", status: "Registered", wishlist: "A book" },
    ],
    restrictions: [
      { ownerId: "a", otherId: "b", direction: "give" },
      { ownerId: "b", otherId: "a", direction: "give", setByOrganizer: true },
    ],
  });

  check("the exchange comes back", restored.eventName === "Office Secret Santa" && restored.eventCode === "ABC123");
  check("including whether it is invitation only", restored.allowOpenJoin === false);
  check(
    "the organizer is not listed among the invitees as well as in their own fields",
    restored.invitees.length === 1 && restored.invitees[0].id === "a",
    JSON.stringify(restored.invitees.map((i) => i.id))
  );
  check("what somebody wrote survives the round trip", restored.invitees[0].wishlist === "A book");

  // The one that matters: a restriction the organizer set for somebody
  // is honoured by the draw and must never appear on that person's own
  // list, and this state is that list.
  check(
    "an organizer-set restriction does not come back as the person's own",
    restored.restrictions.length === 1 && restored.restrictions[0].ownerId === "a",
    JSON.stringify(restored.restrictions)
  );

  // A date column can arrive with a time on it depending on the driver.
  check(
    "a date is taken as a date however it arrives",
    fromOrganizerView({ exchange: { draw_date: "2026-12-16T00:00:00+00:00" } }).drawDate === "2026-12-16"
  );

  check(
    "an empty answer does not throw",
    fromOrganizerView({}).eventName === "" && fromOrganizerView({}).invitees.length === 0
  );
}

{
  console.log("\n15. The management link");

  const token = "a".repeat(64);

  check("a management route yields its token", matchManageToken(`/manage/${token}`) === token);
  check("a trailing slash is fine", matchManageToken(`/manage/${token}/`) === token);
  check("other routes are not management routes", matchManageToken("/create") === null);
  check("nor is the registration route", matchManageToken("/event/ABC123") === null);

  // The shape is a guard, not a check of the token itself: only the
  // database can say whether one is real. It keeps obvious rubbish
  // from being sent, and keeps a short or odd path from being treated
  // as a credential at all.
  check("something far too short is not taken for a token", matchManageToken("/manage/abc") === null);
  check("nor is a path with a slash in the middle", matchManageToken(`/manage/${token}/extra`) === null);
  check("nor one with characters a hex token cannot contain", matchManageToken(`/manage/${"a".repeat(60)}..//`) === null);
  check("an empty route is not one either", matchManageToken("/") === null);
}

console.log(`\n${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
