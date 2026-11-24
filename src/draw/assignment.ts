/**
 * One-way draw assignment.
 *
 * Pure and app-agnostic on purpose: no React, no app types, no I/O, so
 * Quick Draw can reuse it unchanged.
 *
 * The problem: give every person exactly one recipient, where every
 * person is somebody's recipient exactly once, nobody draws themselves,
 * and no forbidden pairing is used. That is a perfect matching on a
 * bipartite graph of givers against receivers, so it is solved exactly
 * rather than by reshuffling and hoping. Shuffling cannot tell an
 * unlucky run apart from an impossible one.
 */

export type DrawPerson = {
  id: string;
  name: string;
};

/** A pairing the draw must not use: `giverId` must not buy for `receiverId`. */
export type ForbiddenPairing = {
  giverId: string;
  receiverId: string;
};

export type Assignment = {
  giverId: string;
  receiverId: string;
};

export type DrawSuccess = {
  ok: true;
  assignments: Assignment[];
};

export type DrawFailure = {
  ok: false;
  /**
   * A set of givers whose combined permitted recipients are too few for
   * all of them to be served - the actual reason the draw cannot be
   * completed, suitable for showing to an organizer.
   */
  blockedGiverIds: string[];
  /** Everyone those givers are collectively still allowed to buy for. */
  availableReceiverIds: string[];
};

export type DrawResult = DrawSuccess | DrawFailure;

/** Deterministic in tests, shuffled in real use. */
export type RandomSource = () => number;

const pairKey = (giverId: string, receiverId: string) =>
  `${giverId}\u0000${receiverId}`;

/**
 * Collapse pairings to a unique set, dropping self-pairings and any
 * naming someone outside the draw.
 *
 * Two people can express the same pairing from opposite ends - one
 * refusing to give, the other refusing to receive - so the count of
 * restriction records is not the count of blocked pairings.
 */
export function distinctForbiddenPairings(
  people: DrawPerson[],
  forbidden: ForbiddenPairing[]
): ForbiddenPairing[] {
  const present = new Set(people.map((person) => person.id));
  const seen = new Set<string>();
  const result: ForbiddenPairing[] = [];

  for (const pairing of forbidden) {
    if (
      pairing.giverId === pairing.receiverId ||
      !present.has(pairing.giverId) ||
      !present.has(pairing.receiverId)
    ) {
      continue;
    }

    const key = pairKey(pairing.giverId, pairing.receiverId);

    if (!seen.has(key)) {
      seen.add(key);
      result.push(pairing);
    }
  }

  return result;
}

/** Who each person is still allowed to buy for. */
export function permittedRecipients(
  people: DrawPerson[],
  forbidden: ForbiddenPairing[]
): Map<string, string[]> {
  const blocked = new Set(
    distinctForbiddenPairings(people, forbidden).map((pairing) =>
      pairKey(pairing.giverId, pairing.receiverId)
    )
  );

  const permitted = new Map<string, string[]>();

  for (const giver of people) {
    permitted.set(
      giver.id,
      people
        .filter(
          (receiver) =>
            receiver.id !== giver.id &&
            !blocked.has(pairKey(giver.id, receiver.id))
        )
        .map((receiver) => receiver.id)
    );
  }

  return permitted;
}

function shuffled<T>(items: T[], random: RandomSource): T[] {
  const copy = [...items];

  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }

  return copy;
}

/**
 * Shrink a blocking set to something an organizer can act on: drop any
 * giver the set does not need to still be a violation.
 */
function minimizeBlockingSet(
  givers: string[],
  permitted: Map<string, string[]>
): string[] {
  const recipientsOf = (group: string[]) => {
    const union = new Set<string>();

    for (const giver of group) {
      for (const receiver of permitted.get(giver) ?? []) {
        union.add(receiver);
      }
    }

    return union;
  };

  let current = [...givers];

  for (const giver of givers) {
    const candidate = current.filter((id) => id !== giver);

    if (
      candidate.length > 0 &&
      recipientsOf(candidate).size < candidate.length
    ) {
      current = candidate;
    }
  }

  return current;
}

/**
 * Find a complete assignment, or explain precisely why none exists.
 *
 * Augmenting-path matching. When a giver cannot be placed even after
 * rearranging everyone before them, the givers reached during that
 * search are collectively restricted to too few recipients, which is
 * the explanation returned.
 */
export function findAssignment(
  people: DrawPerson[],
  forbidden: ForbiddenPairing[],
  random: RandomSource = Math.random
): DrawResult {
  if (people.length < 2) {
    return {
      ok: false,
      blockedGiverIds: people.map((person) => person.id),
      availableReceiverIds: [],
    };
  }

  const permitted = permittedRecipients(people, forbidden);

  // Giver for each receiver.
  const takenBy = new Map<string, string>();

  const tryPlace = (
    giverId: string,
    visitedReceivers: Set<string>
  ): boolean => {
    for (const receiverId of shuffled(
      permitted.get(giverId) ?? [],
      random
    )) {
      if (visitedReceivers.has(receiverId)) {
        continue;
      }

      visitedReceivers.add(receiverId);

      const currentGiver = takenBy.get(receiverId);

      if (
        currentGiver === undefined ||
        tryPlace(currentGiver, visitedReceivers)
      ) {
        takenBy.set(receiverId, giverId);
        return true;
      }
    }

    return false;
  };

  for (const giver of shuffled(people, random)) {
    const visitedReceivers = new Set<string>();

    if (!tryPlace(giver.id, visitedReceivers)) {
      // This giver plus everyone displaced during the search share the
      // visited recipients, and there are not enough to go round.
      const blocked = [giver.id];

      for (const receiverId of visitedReceivers) {
        const holder = takenBy.get(receiverId);

        if (holder !== undefined) {
          blocked.push(holder);
        }
      }

      const minimal = minimizeBlockingSet(blocked, permitted);
      const available = new Set<string>();

      for (const blockedGiver of minimal) {
        for (const receiverId of permitted.get(blockedGiver) ?? []) {
          available.add(receiverId);
        }
      }

      return {
        ok: false,
        blockedGiverIds: minimal,
        availableReceiverIds: [...available],
      };
    }
  }

  const assignments: Assignment[] = [];

  for (const [receiverId, giverId] of takenBy) {
    assignments.push({ giverId, receiverId });
  }

  return { ok: true, assignments };
}

/**
 * What the organizer would have to drop to make an impossible draw
 * possible.
 *
 * One removal is often not enough: if three people may each only give
 * to one and the same person, freeing one of them still leaves two
 * competing for a single recipient. So the smallest workable number is
 * searched for, smallest first, rather than assuming it is one.
 *
 * Only restrictions belonging to the givers currently blocking the draw
 * can help, which keeps the search small.
 */
export type RemovalSuggestion =
  | { status: "already-possible" }
  | {
      status: "remove";
      /** Fewest restrictions that have to go. */
      size: number;
      /** Example sets of that size, each of which makes the draw possible. */
      options: ForbiddenPairing[][];
    }
  | { status: "no-suggestion"; searchedUpTo: number };

const samePairing = (a: ForbiddenPairing, b: ForbiddenPairing) =>
  a.giverId === b.giverId && a.receiverId === b.receiverId;

const withoutPairing = (
  pairings: ForbiddenPairing[],
  removed: ForbiddenPairing
) => pairings.filter((pairing) => !samePairing(pairing, removed));

export function suggestedRemovals(
  people: DrawPerson[],
  forbidden: ForbiddenPairing[],
  random: RandomSource = Math.random,
  maxSize = 3,
  maxOptions = 8
): RemovalSuggestion {
  if (findAssignment(people, forbidden, random).ok) {
    return { status: "already-possible" };
  }

  // Every set of exactly `depth` removals that makes the draw possible.
  const search = (
    pairings: ForbiddenPairing[],
    depth: number,
    collected: ForbiddenPairing[][],
    chosen: ForbiddenPairing[]
  ) => {
    if (collected.length >= maxOptions) {
      return;
    }

    const result = findAssignment(people, pairings, random);

    if (depth === 0) {
      if (result.ok) {
        collected.push([...chosen]);
      }
      return;
    }

    if (result.ok) {
      // Already solvable with fewer; a smaller depth will have found it.
      return;
    }

    const blocked = new Set(result.blockedGiverIds);

    for (const candidate of distinctForbiddenPairings(
      people,
      pairings
    ).filter((pairing) => blocked.has(pairing.giverId))) {
      search(
        withoutPairing(pairings, candidate),
        depth - 1,
        collected,
        [...chosen, candidate]
      );

      if (collected.length >= maxOptions) {
        return;
      }
    }
  };

  for (let size = 1; size <= maxSize; size += 1) {
    const collected: ForbiddenPairing[][] = [];

    search(forbidden, size, collected, []);

    if (collected.length > 0) {
      return { status: "remove", size, options: collected };
    }
  }

  return { status: "no-suggestion", searchedUpTo: maxSize };
}
