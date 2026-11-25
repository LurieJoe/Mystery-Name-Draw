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
    hash: "",
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
  [
    1,
    "SettingsStep",
    ["Gift Exchange Settings", "Step 1 of 3", "Your Name"],
    // Required-field messages wait until the organizer has typed.
    ["Required because you are in the exchange"],
  ],
  [2, "ReviewStep", ["Review", "Step 2 of 3"]],
  [3, "CreatedStep", ["Registration Link", "Step 3 of 3", "/#/event/"]],
  [4, "InvitationStep", "Invitation List"],
  [5, "ManageStep", "Manage Exchange"],
  [6, "ValidationStep", "Not enough participants"],
];

let passed = 0;
let failed = 0;

/**
 * renderToStaticMarkup escapes apostrophes and quotes, so asserting on a
 * phrase as it is written in the page would fail on "else\u0027s". The
 * assertions should read the way the page reads.
 */
function decodeEntities(html) {
  return html
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&#x2F;/g, "/")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function check(label, render, mustContain, mustNotContain) {
  try {
    const html = decodeEntities(render());

    if (typeof html !== "string" || html.length < 20) {
      throw new Error("rendered almost nothing");
    }

    for (const needle of [].concat(mustContain || [])) {
      if (!html.includes(needle)) {
        throw new Error(`markup is missing ${JSON.stringify(needle)}`);
      }
    }

    for (const needle of [].concat(mustNotContain || [])) {
      if (html.includes(needle)) {
        throw new Error(
          `markup should not contain ${JSON.stringify(needle)} yet`
        );
      }
    }

    // "roster" is an internal name for the managed list. It reached the
    // UI once through a careless rename; it must not again.
    if (/\broster\b/i.test(html)) {
      throw new Error('the word "roster" leaked into the rendered page');
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

const LandingPage = require(`${OUT}/pages/LandingPage.js`).default;

// "/" is the landing page now; the wizard lives at /#/create.
check(
  "App at / (the landing page)",
  () => renderToStaticMarkup(React.createElement(App)),
  ["Mystery Name Draw", "Draw names without making anyone sign up"]
);

check(
  "LandingPage on its own",
  () => renderToStaticMarkup(React.createElement(LandingPage)),
  ["How it works", "Start a Gift Exchange", "pigeon-messenger.png"]
);

for (const [step, name, needle, forbidden] of STEPS) {
  const Component = require(`${OUT}/pages/steps/${name}.js`).default;

  check(
    `step ${step} (${name})`,
    () =>
      renderToStaticMarkup(
        React.createElement(Harness, { step, Component })
      ),
    needle,
    forbidden
  );
}

for (const [name, needles, forbidden] of [
  [
    "FaqPage",
    [
      "Questions",
      "Does anyone need an account?",
      "Can I close registration early?",
      "What if the registration link gets out?",
      "contact@mysterynamedraw.com",
      "Brain Bench Apps",
    ],
    // The old address lived in two pages and is easy to reintroduce.
    ["contact@brainbenchapps.com"],
  ],
  [
    "PrivacyPage",
    ["Privacy", "no accounts and no passwords", "contact@mysterynamedraw.com"],
    ["contact@brainbenchapps.com"],
  ],
  [
    "QuickDrawPage",
    [
      "Quick Draw",
      "What are you using this for?",
      "Everyone draws a name",
      "Hand each person someone else's work",
      "Partner people up",
      "Split into groups",
    ],
    // Quick Draw asks what the draw is for first. The paste box and the
    // group size only appear once a purpose is chosen, so a change that
    // skips the chooser fails here.
    ["One name per line", "Draw again", "How many people in each group?"],
  ],
]) {
  const Page = require(`${OUT}/pages/${name}.js`).default;
  check(
    name,
    () => renderToStaticMarkup(React.createElement(Page)),
    needles,
    forbidden
  );
}

// Clicking "Create a Quick Draw" in the header sets the hash. Prove the
// route resolves, so a dead button can be told apart from a dead route.
check(
  "App at /#/quick (the Quick Draw route)",
  () => {
    globalThis.window.location.hash = "#/quick";
    try {
      return renderToStaticMarkup(React.createElement(App));
    } finally {
      globalThis.window.location.hash = "";
    }
  },
  ["Quick Draw", "What are you using this for?"]
);

// The screen a registered person comes back to. It only appears after
// a click, so it is rendered directly: a branch nothing can reach is a
// branch nothing checks.
const RegisteredView = require(`${OUT}/pages/RegisteredView.js`).default;

const {
  exchangePreview,
  registrationView,
} = require("./fixtures/registration.cjs");

const JoinForm = require(`${OUT}/pages/JoinForm.js`).default;

check(
  "RegisteredView (coming back to your own page)",
  () =>
    renderToStaticMarkup(
      React.createElement(RegisteredView, {
        view: registrationView,
        busy: false,
        error: null,
        onSave: () => {},
        onToggleRestriction: () => {},
        onWithdraw: () => {},
      })
    ),
  [
    "You are in",
    // What was saved is what is shown: the fields are seeded from the
    // registration, not left blank for the person to retype.
    "A book about engines",
    "No chocolate, please",
    "Save changes",
    // Preferences, not guarantees: said plainly, because a draw can
    // need one of them set aside.
    "preferences, not guarantees",
    "Cancel my registration",
    "I would rather not buy for",
    "I would rather not receive from",
    "Mina Okafor",
    "Teo Vasquez",
  ],
  // Nobody sets a restriction against themselves.
  ["Rowan Hale</label>"]
);

check(
  "JoinForm (arriving from the link)",
  () =>
    renderToStaticMarkup(
      React.createElement(JoinForm, {
        preview: exchangePreview,
        busy: false,
        error: null,
        onJoin: () => {},
        onCancel: () => {},
      })
    ),
  [
    "Join Office Secret Santa",
    "Confirm Registration",
    "Cancel",
    "$25 USD",
    "Your wishlist",
  ],
  // An exchange anybody may join does not warn about invitations, and
  // an open one does not say registration is closed.
  ["invitation only", "Registration is closed"]
);

check(
  "JoinForm when the organizer kept it to the people they listed",
  () =>
    renderToStaticMarkup(
      React.createElement(JoinForm, {
        preview: { ...exchangePreview, openToAnyone: false },
        onJoin: () => {},
        onCancel: () => {},
      })
    ),
  ["This one is invitation only", "Dana Whitlock"]
);

check(
  "JoinForm after the deadline",
  () =>
    renderToStaticMarkup(
      React.createElement(JoinForm, {
        preview: { ...exchangePreview, registrationOpen: false },
        onJoin: () => {},
        onCancel: () => {},
      })
    ),
  ["Registration is closed"]
);

// An organizer who sets the draw a day after the deadline leaves no
// restriction window. Neither screen may promise one.
const noWindow = {
  registrationDeadline: "2026-12-10",
  drawDate: "2026-12-11",
};

check(
  "RegisteredView when the dates leave no restriction window",
  () =>
    renderToStaticMarkup(
      React.createElement(RegisteredView, {
        view: {
          ...registrationView,
          exchange: { ...registrationView.exchange, ...noWindow },
        },
        onSave: () => {},
        onToggleRestriction: () => {},
        onWithdraw: () => {},
      })
    ),
  ["too soon after", "matched at random", "Dana Whitlock"],
  // The explanation and the checkboxes both have to go: describing
  // how restrictions work and then saying they are off reads as a
  // fault with the page.
  ["preferences, not guarantees", "I would rather not buy for", "Mina Okafor"]
);

check(
  "JoinForm when the dates leave no restriction window",
  () =>
    renderToStaticMarkup(
      React.createElement(JoinForm, {
        preview: { ...exchangePreview, ...noWindow },
        onJoin: () => {},
        onCancel: () => {},
      })
    ),
  ["too soon after", "matched at random"],
  ["you can come back and say who you would rather not"]
);

// Without settings to reach a database, the page says so rather than
// blaming the link the reader was sent.
check(
  "RegisterPage at /event/ABC123",
  () =>
    renderToStaticMarkup(
      React.createElement(RegisterPage, { eventCode: "ABC123" })
    ),
  ["ABC123", "Not connected to a database"]
);

console.log(`\n${passed} rendered, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
