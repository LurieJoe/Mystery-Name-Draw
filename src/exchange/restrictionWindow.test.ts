import { restrictionWindow } from "./restrictionWindow.js";

let failed = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);

  if (a === b) {
    console.log(`  PASS  ${label}`);
  } else {
    console.log(`  FAIL  ${label}\n        got      ${a}\n        expected ${b}`);
    failed += 1;
  }
}

console.log("\nThe restriction window:\n");

check(
  "the default five-day gap is comfortable",
  restrictionWindow("2026-12-10", "2026-12-15"),
  { days: 5, usable: true, tight: false }
);

check(
  "four days is the point where the warning stops",
  restrictionWindow("2026-12-10", "2026-12-14"),
  { days: 4, usable: true, tight: false }
);

check(
  "three days is usable but worth warning about",
  restrictionWindow("2026-12-10", "2026-12-13"),
  { days: 3, usable: true, tight: true }
);

check(
  "two days is the floor: the notice lands a day before the draw",
  restrictionWindow("2026-12-10", "2026-12-12"),
  { days: 2, usable: true, tight: true }
);

check(
  "one day is not a window: the notice and the draw are the same moment",
  restrictionWindow("2026-12-10", "2026-12-11"),
  { days: 1, usable: false, tight: false }
);

check(
  "a draw on the deadline leaves nothing at all",
  restrictionWindow("2026-12-10", "2026-12-10"),
  { days: 0, usable: false, tight: false }
);

// The schema forbids it, but the wizard can hold it mid-edit.
check(
  "a draw before the deadline is no window rather than a negative one",
  restrictionWindow("2026-12-10", "2026-12-08"),
  { days: 0, usable: false, tight: false }
);

check(
  "a month-long gap",
  restrictionWindow("2026-11-15", "2026-12-15"),
  { days: 30, usable: true, tight: false }
);

// Late autumn in the northern hemisphere crosses the end of daylight
// saving, which is where a locally-built date loses or gains an hour
// and rounds to the wrong number of days.
check(
  "a gap spanning the daylight saving change is still whole days",
  restrictionWindow("2026-10-30", "2026-11-06"),
  { days: 7, usable: true, tight: false }
);

check("an empty deadline is not a window", restrictionWindow("", "2026-12-15"), null);
check("an empty draw date is not a window", restrictionWindow("2026-12-10", ""), null);
check("a malformed date is not a window", restrictionWindow("Dec 10", "2026-12-15"), null);

console.log(
  failed === 0
    ? "\nAll restriction window checks passed.\n"
    : `\n${failed} failed.\n`
);

if (failed > 0) process.exit(1);
