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
  const parsed = parseNames("  Ada \n\nGrace,Alan\n  \nKatherine  Johnson ");
  check(
    "trims, splits on newlines and commas, drops blanks",
    parsed.map((p) => p.name).join("|") ===
      "Ada|Grace|Alan|Katherine Johnson",
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
    '"Lovelace, Ada",1001,ada@example.edu\n' +
    "Grace Hopper,1002,grace@example.edu\n" +
    "Alan Turing,1003,alan@example.edu\n";

  const fromGradebook = parseCsvNames(gradebook);
  check(
    "the heading row is dropped and the first column wins",
    fromGradebook.join("|") === "Lovelace, Ada|Grace Hopper|Alan Turing",
    fromGradebook.join("|")
  );

  check(
    "a plain text list needs no commas at all",
    parseCsvNames("Ada\nGrace\nAlan").join("|") === "Ada|Grace|Alan"
  );

  check(
    "a name that merely looks like a heading is kept when it is not first",
    parseCsvNames("Ada\nName\nGrace").join("|") === "Ada|Name|Grace",
    parseCsvNames("Ada\nName\nGrace").join("|")
  );

  check(
    "CRLF line endings do not produce empty rows",
    parseCsvNames("Name\r\nAda\r\nGrace\r\n").join("|") === "Ada|Grace",
    parseCsvNames("Name\r\nAda\r\nGrace\r\n").join("|")
  );

  check(
    "a doubled quote inside a quoted cell is one quote",
    parseCsvNames('"Ada ""Addy"" Lovelace",1001').join("|") ===
      'Ada "Addy" Lovelace',
    parseCsvNames('"Ada ""Addy"" Lovelace",1001').join("|")
  );

  check(
    "a leading byte order mark does not stick to the first name",
    parseCsvNames("\uFEFFAda\nGrace")[0] === "Ada",
    parseCsvNames("\uFEFFAda\nGrace")[0]
  );

  check("blank rows are skipped", parseCsvNames("Ada\n\n\nGrace").length === 2);
  check("an empty file gives nobody", parseCsvNames("").length === 0);

  const written = toCsvNames(['Lovelace, Ada', 'Ada "Addy"', "Grace"]);
  check(
    "a name with a comma or a quote is quoted on the way out",
    written === 'Name\n"Lovelace, Ada"\n"Ada ""Addy"""\nGrace',
    JSON.stringify(written)
  );

  check(
    "what is written reads back unchanged",
    parseCsvNames(written).join("|") === 'Lovelace, Ada|Ada "Addy"|Grace',
    parseCsvNames(written).join("|")
  );

  const everyName = ["Ada", "Grace", "Alan"];
  check(
    "a round trip survives the draw's own parser too",
    parseNames(parseCsvNames(toCsvNames(everyName)).join("\n"))
      .map((person) => person.name)
      .join("|") === "Ada|Grace|Alan"
  );
}

{
  console.log("\n10. A surname-first cell is not two students");

  check(
    "a surname-first name is flipped",
    flipSurnameFirst("Lovelace, Ada") === "Ada Lovelace"
  );
  check(
    "a suffix is left where it is",
    flipSurnameFirst("Smith, Jr.") === "Smith, Jr."
  );
  check(
    "a plain name is untouched",
    flipSurnameFirst("Ada Lovelace") === "Ada Lovelace"
  );
  check(
    "a cell with two commas is left alone rather than guessed at",
    flipSurnameFirst("Lovelace, Ada, Ada") === "Lovelace, Ada, Ada"
  );

  const imported = csvNamesForEditing(
    'Student Name,ID\n"Lovelace, Ada",1\n"Hopper, Grace",2\n'
  );
  check(
    "a gradebook import arrives first-name-first",
    imported.join("|") === "Ada Lovelace|Grace Hopper",
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
    parseNames('Lovelace, Ada\nHopper, Grace').length === 4
  );
}

console.log(`\n${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
