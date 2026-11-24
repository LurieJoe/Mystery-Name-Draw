/**
 * Pairing and grouping, for draws where the organizer already holds the
 * list and nobody registers.
 *
 * Deliberately separate from assignment.ts. A one-way assignment is a
 * matching problem with constraints; these two are partitions of a
 * shuffled list. Keeping them apart stops the constrained solver from
 * being dragged into cases that do not need it.
 */

import type { DrawPerson, RandomSource } from "./assignment";

export function shuffle<T>(items: T[], random: RandomSource): T[] {
  const copy = [...items];

  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }

  return copy;
}

/**
 * Split into groups of roughly `size`.
 *
 * Sizes differ by at most one, and nobody is left in a group alone:
 * ten people in threes gives 4, 3, 3 rather than 3, 3, 3, 1. A leftover
 * person on their own is the whole point of the exercise failing.
 */
export function makeGroups(
  people: DrawPerson[],
  size: number,
  random: RandomSource = Math.random
): DrawPerson[][] {
  if (people.length === 0) {
    return [];
  }

  const wanted = Math.max(2, Math.floor(size));
  const groupCount = Math.max(1, Math.floor(people.length / wanted));
  const order = shuffle(people, random);

  const groups: DrawPerson[][] = Array.from(
    { length: groupCount },
    () => []
  );

  // Deal round-robin: every group ends within one of every other.
  order.forEach((person, index) => {
    groups[index % groupCount].push(person);
  });

  return groups;
}

/**
 * Pair people off, two by two.
 *
 * An odd number cannot pair evenly, so one group of three is made
 * rather than leaving somebody out. Which is the same rule as
 * `makeGroups` with a size of two, so it is the same code.
 */
export function makeMutualPairs(
  people: DrawPerson[],
  random: RandomSource = Math.random
): DrawPerson[][] {
  if (people.length < 2) {
    return people.length ? [people] : [];
  }

  return makeGroups(people, 2, random);
}

/** Names typed or pasted one per line, cleaned up. */
export function parseNames(input: string): DrawPerson[] {
  const seenCount = new Map<string, number>();
  const people: DrawPerson[] = [];

  for (const raw of input.split(/[\n,]/)) {
    const name = raw.trim().replace(/\s+/g, " ");

    if (!name) {
      continue;
    }

    // Two people really can share a name, so a repeat is numbered
    // rather than silently dropped.
    const key = name.toLowerCase();
    const nth = (seenCount.get(key) ?? 0) + 1;
    seenCount.set(key, nth);

    people.push({
      id: `${key}-${people.length}`,
      name: nth === 1 ? name : `${name} (${nth})`,
    });
  }

  return people;
}
