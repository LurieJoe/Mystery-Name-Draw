/**
 * Check the stylesheets for things the production build rejects.
 *
 * `npm run dev` is forgiving; lightningcss, which minifies the
 * production build, is not. A `//` comment works in the dev server and
 * fails the build, so the mistake is invisible until a deploy. Catch it
 * here instead.
 *
 * Run with: npm run check:css
 */

const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "src");

function stylesheets(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      return stylesheets(full);
    }

    return entry.name.endsWith(".css") ? [full] : [];
  });
}

const problems = [];

for (const file of stylesheets(root)) {
  const css = fs.readFileSync(file, "utf8");
  const shown = path.relative(path.join(__dirname, ".."), file);

  css.split("\n").forEach((line, index) => {
    if (line.trim().startsWith("//")) {
      problems.push(
        `${shown}:${index + 1}  "//" is not a CSS comment; use /* */`
      );
    }
  });

  // A full parse catches everything else, when postcss is around. It is
  // optional so that pruning unused dependencies cannot break the check.
  try {
    require("postcss").parse(css, { from: file });
  } catch (error) {
    if (error && error.name === "CssSyntaxError") {
      problems.push(`${shown}  ${error.reason} (line ${error.line})`);
    }
  }
}

if (problems.length === 0) {
  console.log("CSS looks fine.");
} else {
  console.log("CSS problems that would fail the production build:\n");
  for (const problem of problems) {
    console.log(`  ${problem}`);
  }
  process.exit(1);
}
