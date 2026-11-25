/*
 * The draw algorithm, copied where the Edge Function can be deployed
 * with it.
 *
 * The function needs src/draw/assignment.ts, and the Supabase CLI
 * bundles supabase/functions. Rather than rely on its bundler
 * following a relative import three levels up and out of that tree,
 * the file is copied in - and because a copy that can drift from its
 * original is exactly the thing worth avoiding here, `--check` fails
 * the build when the two disagree.
 *
 * Two implementations of this matching would be a real hazard: the
 * day they stop agreeing is the day somebody is told to buy for a
 * person they asked not to be matched with, and nobody can read the
 * result back to notice.
 */

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

const COPIES = [
  {
    from: "src/draw/assignment.ts",
    to: "supabase/functions/_shared/assignment.ts",
  },
  {
    from: "src/email/templates.ts",
    to: "supabase/functions/_shared/templates.ts",
  },
];

const BANNER = (from) =>
  `// Generated from ${from} by scripts/sync-shared.cjs. Do not edit:\n` +
  `// run \`npm run sync:shared\` after changing the original.\n\n`;

const expected = ({ from }) =>
  BANNER(from) + fs.readFileSync(path.join(ROOT, from), "utf8");

const checking = process.argv.includes("--check");
let stale = [];

for (const copy of COPIES) {
  const target = path.join(ROOT, copy.to);
  const wanted = expected(copy);
  const current = fs.existsSync(target)
    ? fs.readFileSync(target, "utf8")
    : null;

  if (current === wanted) continue;

  if (checking) {
    stale.push(copy);
  } else {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, wanted);
    console.log(`synced ${copy.to}`);
  }
}

if (checking && stale.length) {
  console.error("\nThese copies are out of date with their originals:\n");
  for (const copy of stale) {
    console.error(`  ${copy.to}  <-  ${copy.from}`);
  }
  console.error("\nRun: npm run sync:shared\n");
  process.exit(1);
}

if (checking) {
  console.log(`${COPIES.length} shared copy matches its original.`);
} else if (!stale.length) {
  console.log("shared copies already up to date.");
}
