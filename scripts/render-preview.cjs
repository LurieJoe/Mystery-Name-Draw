/**
 * Render a page to a standalone HTML file, stylesheets inlined.
 *
 * Vite cannot run everywhere this repo gets worked on, and a layout bug
 * is invisible to the render tests: they check that the words are
 * present, not where they land. This writes a file you can open in any
 * browser, or measure with a headless one.
 *
 * Run with: npm run preview -- LandingPage
 * Output:   .tmp-preview/<PageName>.html
 */

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, ".tmp-smoke");
const DEST = path.join(ROOT, ".tmp-preview");

const page = process.argv[2] || "LandingPage";

if (!fs.existsSync(OUT)) {
  console.error("Compile first: npm run smoke");
  process.exit(1);
}

fs.writeFileSync(
  path.join(OUT, "package.json"),
  JSON.stringify({ type: "commonjs" })
);

const Module = require("node:module");
const load = Module._load;

Module._load = function (request, parent, isMain) {
  if (request.endsWith(".css")) {
    return {};
  }

  return load(request, parent, isMain);
};

globalThis.window = {
  location: {
    origin: "https://mysterynamedraw.com",
    pathname: "/",
    hash: "",
    href: "https://mysterynamedraw.com/",
  },
  history: { pushState() {} },
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {},
  confirm: () => true,
  alert() {},
};

globalThis.document = {
  documentElement: { setAttribute() {} },
  getElementById: () => null,
  createElement: () => ({ click() {}, setAttribute() {}, style: {} }),
  body: { appendChild() {}, removeChild() {} },
};

globalThis.navigator = { clipboard: { writeText: async () => {} } };

const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

// A wizard step needs the exchange context, and a step number, so it
// is rendered through the same harness the render tests use. Call it
// as: npm run preview -- ManageStep 5
const stepNumber = Number(process.argv[3]);
const isStep = page.endsWith("Step");

// Screens that read the exchange rather than standing alone.
const needsContext =
  isStep || page === "RegisteredView" || page === "RegisterPage";

const Page = isStep
  ? require(`${OUT}/pages/steps/${page}.js`).default
  : require(`${OUT}/pages/${page}.js`).default;

const { ExchangeContext } = require(`${OUT}/exchange/context.js`);
const { useExchange } = require(`${OUT}/exchange/useExchange.js`);

function Harness() {
  const exchange = useExchange();

  return React.createElement(
    ExchangeContext.Provider,
    {
      value: {
        ...exchange,
        currentStep: stepNumber || 1,
        // Enough of an exchange to lay out: the overflow this preview
        // exists to catch only appears once there are rows.
        eventName: "Mobile gift swap",
        eventCode: "38ESJ4UA",
        giftBudget: "25",
        // roster is derived inside the hook from its own state, so
        // overriding invitees alone renders an empty table and the row
        // layout never gets looked at.
        roster: [
          { id: "a", name: "Rowan Hale", email: "ada.lovelace@example.com", status: "Registered" },
          { id: "b", name: "Mina Okafor", email: "grace@example.com", status: "Invited" },
          { id: "c", name: "Theo Barnes", email: "alan.turing@example.com", status: "Invite Pending" },
        ],
        // RegisteredView reads the saved values back, so the fixture
        // has to contain something to read.
        participants: [
          { id: "a", name: "Rowan Hale", email: "ada.lovelace@example.com", status: "Registered" },
          { id: "b", name: "Mina Okafor", email: "grace@example.com", status: "Registered" },
        ],
        restrictionsOpen: true,
        // Matching codes, or RegisterPage shows its "no exchange here"
        // notice instead of the form.
        eventCode: "ABC123",
        giftBudgetLabel: "$25 USD",
        drawDate: "2026-12-16",
        registrationDeadline: "2026-12-11",
        invitees: [
          { id: "a", name: "Rowan Hale", email: "ada@example.com", status: "Registered",
            wishlist: "A book about engines", preferences: "No chocolate, please" },
          { id: "b", name: "Mina Okafor", email: "grace@example.com", status: "Invited" },
          { id: "c", name: "Theo Barnes", email: "alan@example.com", status: "Invite Pending" },
        ],
      },
    },
    // The register styles are scoped under .register-page, which lives
    // on RegisterPage's own <main>. Previewing the inner view without
    // that wrapper shows a layout the app never renders.
    page === "RegisteredView"
      ? React.createElement(
          "main",
          { className: "content-page register-page" },
          React.createElement(Page, {
            registeredId: "a",
            onWithdraw: () => {},
          })
        )
      : React.createElement(
          Page,
          page === "RegisterPage" ? { eventCode: "ABC123" } : null
        )
  );
}

// Every stylesheet in the app, so nothing is missing from the preview.
function stylesheets(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const full = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        return stylesheets(full);
      }

      return entry.name.endsWith(".css") ? [full] : [];
    });
}

const css = stylesheets(path.join(ROOT, "src"))
  .map((file) => fs.readFileSync(file, "utf8"))
  .join("\n");

fs.mkdirSync(DEST, { recursive: true });

const file = path.join(DEST, `${page}.html`);

fs.writeFileSync(
  file,
  `<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${page} preview</title>
<style>${css}</style>
</head>
<body><div id="root">${renderToStaticMarkup(React.createElement(needsContext ? Harness : Page))}</div></body>
</html>`
);

console.log(`wrote ${path.relative(ROOT, file)}`);
