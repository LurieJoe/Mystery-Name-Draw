/*
 * Every call the browser makes, checked against the functions the
 * database actually has.
 *
 * These calls are strings and object keys on one side and PL/pgSQL
 * argument names on the other, with HTTP in between. Nothing in the
 * type system joins the two, so a mistyped p_event_code compiles,
 * passes every render check, and fails only when a real person opens
 * a real link. This reads both sides and compares them.
 *
 * It is a text comparison, not a connection: it runs anywhere, needs
 * no database, and so has no excuse not to run on every check.
 */

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

// --------------------------------------------------------------------
// What the database offers
// --------------------------------------------------------------------

/**
 * Parameter names per function, from the migrations.
 *
 * Later migrations replace earlier ones, so each definition
 * overwrites what came before, exactly as running them in order does.
 */
function functionsFromMigrations() {
  const dir = path.join(ROOT, "supabase", "migrations");
  const found = new Map();

  for (const file of fs.readdirSync(dir).sort()) {
    if (!file.endsWith(".sql")) continue;

    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    const pattern =
      /create\s+or\s+replace\s+function\s+([a-z_][a-z0-9_]*)\s*\(([\s\S]*?)\)\s*returns/gi;

    let match;

    while ((match = pattern.exec(sql))) {
      const [, name, rawArgs] = match;
      const required = [];
      const optional = [];

      for (const arg of splitArgs(rawArgs)) {
        const argName = arg.trim().split(/\s+/)[0];

        if (!argName) continue;

        (/\bdefault\b/i.test(arg) ? optional : required).push(argName);
      }

      found.set(name, { required, optional, file });
    }
  }

  return found;
}

/* Commas inside a type or a default would split an argument in two. */
function splitArgs(raw) {
  const args = [];
  let depth = 0;
  let current = "";

  for (const char of raw) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;

    if (char === "," && depth === 0) {
      args.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  if (current.trim()) args.push(current);

  return args;
}

// --------------------------------------------------------------------
// What the browser asks for
// --------------------------------------------------------------------

/*
 * The browser is not the only caller. The Edge Function talks to the
 * same database over the same PostgREST, and its calls are the ones
 * that run unattended at nine in the morning with nobody watching, so
 * they are the ones that most need checking.
 */
const CALLER_DIRS = ["src", "supabase/functions"];

function callsFromClient() {
  const calls = [];

  for (const file of CALLER_DIRS.flatMap((dir) =>
    fs.existsSync(path.join(ROOT, dir)) ? walk(path.join(ROOT, dir)) : []
  )) {
    if (!/\.tsx?$/.test(file)) continue;
    // The generated copy of the draw algorithm makes no calls, and
    // reading it twice would double every count.
    if (file.includes("/_shared/")) continue;

    const source = fs.readFileSync(file, "utf8");
    const pattern =
      /\brpc\s*(?:<[^>]*>)?\s*\(\s*"([a-z_][a-z0-9_]*)"\s*(?:,\s*\{([\s\S]*?)\}\s*)?\)/g;

    let match;

    while ((match = pattern.exec(source))) {
      const [, name, body = ""] = match;
      const args = [...body.matchAll(/(^|[,{\s])(p_[a-z0-9_]*)\s*:/g)].map(
        (m) => m[2]
      );

      calls.push({
        name,
        args,
        where: path.relative(ROOT, file),
      });
    }
  }

  return calls;
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);

    return entry.isDirectory() ? walk(full) : [full];
  });
}

// --------------------------------------------------------------------

const defined = functionsFromMigrations();
const calls = callsFromClient();
const problems = [];

for (const call of calls) {
  const fn = defined.get(call.name);

  if (!fn) {
    problems.push(
      `${call.where}: calls ${call.name}(), which no migration defines`
    );
    continue;
  }

  const known = new Set([...fn.required, ...fn.optional]);

  for (const arg of call.args) {
    if (!known.has(arg)) {
      problems.push(
        `${call.where}: ${call.name}() has no argument ${arg} ` +
          `(it takes ${[...known].join(", ") || "none"})`
      );
    }
  }

  for (const arg of fn.required) {
    if (!call.args.includes(arg)) {
      problems.push(
        `${call.where}: ${call.name}() needs ${arg}, which is not sent`
      );
    }
  }
}

if (calls.length === 0) {
  console.error("No rpc() calls found at all, which cannot be right.");
  process.exit(1);
}

if (problems.length) {
  console.error("\nThese calls do not match the database:\n");
  for (const problem of problems) console.error(`  ${problem}`);
  console.error("");
  process.exit(1);
}

console.log(
  `${calls.length} database calls match the migrations ` +
    `(${defined.size} functions defined).`
);
