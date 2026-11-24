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

console.log(`\n${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
