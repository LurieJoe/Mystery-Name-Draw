/**
 * How long participants actually get to set restrictions.
 *
 * The window is every local date after the registration deadline up to
 * and including the draw date, because registration is open through
 * the whole deadline day and the draw does not run until the morning
 * of its own date.
 *
 * The reason this needs a module rather than a subtraction at each
 * call site is that the useful minimum is not one day, it is two, and
 * the reason why is not obvious: the "restrictions are now open" email
 * goes out at nine in the morning on the day after the deadline, and
 * the draw runs at nine in the morning on the draw date. One day apart
 * and those are the same moment, so people would be told they can set
 * restrictions by a message that lands as the matching completes.
 */

export type RestrictionWindow = {
  /** Local dates on which restrictions can be set. */
  days: number;

  /**
   * Whether the window opens far enough ahead of the draw for anybody
   * to be told about it in time.
   */
  usable: boolean;

  /**
   * Open, but short enough that people who do not read email daily
   * will miss it. Worth warning the organizer about, not worth
   * refusing to do.
   */
  tight: boolean;
};

/** Below this the window exists but most people will not see it. */
const COMFORTABLE = 4;

export function restrictionWindow(
  registrationDeadline: string,
  drawDate: string
): RestrictionWindow | null {
  const deadline = parseIsoDate(registrationDeadline);
  const draw = parseIsoDate(drawDate);

  if (deadline === null || draw === null) {
    return null;
  }

  const days = Math.round((draw - deadline) / 86_400_000);

  if (days <= 0) {
    return { days: 0, usable: false, tight: false };
  }

  return {
    days,
    usable: days >= 2,
    tight: days >= 2 && days < COMFORTABLE,
  };
}

/*
 * Parsed as UTC from its parts rather than handed to the Date
 * constructor, so the difference between two dates is a whole number
 * of days wherever this runs. A date built in local time can differ by
 * an hour across a daylight saving boundary, which rounds to the wrong
 * day often enough to matter in late autumn.
 */
function parseIsoDate(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec((value ?? "").trim());

  if (!match) {
    return null;
  }

  const [, year, month, day] = match;

  return Date.UTC(Number(year), Number(month) - 1, Number(day));
}
