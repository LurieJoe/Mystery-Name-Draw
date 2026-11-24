/**
 * Render every page in Node and check it produces sensible markup.
 *
 * The app cannot be unit tested through Vite here, and a page that
 * throws on render looks identical to one that was never checked. This
 * catches broken imports, bad context wiring and crashes on empty data
 * without needing a browser.
 *
 * Run with: npm run smoke
 */

const fs = require("node:fs");
const path = require("node:path");

const OUT = path.join(__dirname, "..", ".tmp-smoke");

// tsc emits CommonJS here, but the repo is "type": "module".
fs.writeFileSync(
  path.join(OUT, "package.json"),
  JSON.stringify({ type: "commonjs" })
);

// The app imports CSS. The files are not copied to the output dir, so
// resolution has to be short-circuited rather than just the loading.
const Module = require("node:module");
const loadModule = Module._load;

Module._load = function (request, parent, isMain) {
  if (request.endsWith(".css")) {
    return {};
  }

  return loadModule(request, parent, isMain);
};

globalThis.window = {
  location: {
    origin: "http://localhost:5173",
    pathname: "/",
    href: "http://localhost:5173/",
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
};

globalThis.navigator = { clipboard: { writeText: async () => {} } };

const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const { ExchangeContext } = require(`${OUT}/exchange/context.js`);
const { useExchange } = require(`${OUT}/exchange/useExchange.js`);
const App = require(`${OUT}/App.js`).default;
const RegisterPage = require(`${OUT}/pages/RegisterPage.js`).default;

const STEPS = [
  [1, "SettingsStep", "Gift Exchange Settings"],
  [2, "ReviewStep", "Review"],
  [3, "CreatedStep", "Registration Link"],
  [4, "InvitationStep", "Invitation List"],
  [5, "ManageStep", "Manage Exchange"],
  [6, "ValidationStep", "Not enough participants"],
];

let passed = 0;
let failed = 0;

function check(label, render, mustContain) {
  try {
    const html = render();

    if (typeof html !== "string" || html.length < 20) {
      throw new Error("rendered almost nothing");
    }

    for (const needle of [].concat(mustContain || [])) {
      if (!html.includes(needle)) {
        throw new Error(`markup is missing ${JSON.stringify(needle)}`);
      }
    }

    passed += 1;
    console.log(`  PASS  ${label}`);
  } catch (error) {
    failed += 1;
    console.log(`  FAIL  ${label}`);
    console.log(`          ${String(error.message).split("\n")[0]}`);
  }
}

function Harness({ step, Component }) {
  const exchange = useExchange();

  return React.createElement(
    ExchangeContext.Provider,
    { value: { ...exchange, currentStep: step } },
    React.createElement(Component)
  );
}

console.log("\nRendering each page with empty state:");

check(
  "App at /",
  () => renderToStaticMarkup(React.createElement(App)),
  ["Mystery Name Draw", "Gift Exchange Settings"]
);

for (const [step, name, needle] of STEPS) {
  const Component = require(`${OUT}/pages/steps/${name}.js`).default;

  check(
    `step ${step} (${name})`,
    () =>
      renderToStaticMarkup(
        React.createElement(Harness, { step, Component })
      ),
    needle
  );
}

check(
  "RegisterPage at /event/ABC123",
  () =>
    renderToStaticMarkup(
      React.createElement(RegisterPage, { eventCode: "ABC123" })
    ),
  ["ABC123", "Registration is not ready yet"]
);

console.log(`\n${passed} rendered, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
