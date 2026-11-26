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
    [
      "Gift Exchange Settings",
      "Step 1 of 3",
      "Your Name",
      // Every currency the dropdown offers needs a symbol in two
      // other places, so the list itself is worth pinning.
      "USD ($)",
      "CAD ($)",
      "GBP (£)",
      "EUR (€)",
      "AUD ($)",
      "BRL (R$)",
      // The second budget line, for a draw spanning two countries.
      "Second way of saying it (optional)",
    ],
    // Required-field messages wait until the organizer has typed.
    ["Required because you are in the exchange"],
  ],
  [2, "ReviewStep", ["Review", "Step 2 of 3"]],
  [
    3,
    "CreatedStep",
    [
      "Registration Link",
      "Step 3 of 3",
      "/#/event/",
      "Let anyone with the link join",
    ],
    // The old label promised an inviting feature that never existed.
    ["Allow participants to invite others"],
  ],
  [
    4,
    "InvitationStep",
    ["Invitation List", "Sharing the link yourself"],
    // These buttons copy a message; they have never sent one. Said
    // plainly, now that this screen also carries the button that does.
    ["Email Invitation", "Text Invitation"],
  ],
  [
    5,
    "ManageStep",
    [
      "Manage Exchange",
      "Who the registration link works for",
      "Messages between participants",
    ],
  ],
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

function Harness({ step, Component, extra }) {
  const exchange = useExchange();

  return React.createElement(
    ExchangeContext.Provider,
    { value: { ...exchange, currentStep: step, ...(extra ?? {}) } },
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
  [
    "How it works",
    "Start a Gift Exchange",
    "pigeon-messenger.png",
    // The pitch, pinned: each clause is a promise the app has to keep.
    "even you won't know who has who",
    "can say who they'd rather not draw",
    "Send the invitations",
  ],
  // The old framing, from when the shared code was the only way in.
  // Invitations have been the main path since November 2026.
  [
    "Share one link.",
    "Everyone finds out who they have",
    // Written before there was a database. It told visitors their
    // work would not be saved, while a real exchange was running.
    "Early preview",
    "nothing is saved",
  ]
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
      // All four sibling apps, or the footer is inconsistent with the
      // umbrella site that lists them.
      "Flashcard Flurry",
      "Geography Gym",
      "Mapdle",
      "Analog Math Clock",
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

// What the management link lands on. An organizer comes back to find
// out who has registered, and used to walk four screens to do it.
const ManageStep = require(`${OUT}/pages/steps/ManageStep.js`).default;

const thirteen = [
  // The organizer's own row carries "Organizer", not "Registered":
  // they are in the draw by taking part, not by registering. A
  // fixture that said Registered hid whether that was handled.
  { id: "organizer", name: "Evelyn", email: "e@example.com", status: "Organizer" },
  { id: "a", name: "Crys", email: "c@example.com", status: "Registered" },
  { id: "b", name: "Sofia", email: "s@example.com", status: "Registered" },
  { id: "c", name: "Marcio", email: "m@example.com", status: "Invited" },
  { id: "d", name: "Paulo", email: "p@example.com", status: "Invited" },
  { id: "e", name: "Eni", email: "en@example.com", status: "Invite Pending" },
];

check(
  "the manage screen says who is in before anything else",
  () =>
    renderToStaticMarkup(
      React.createElement(Harness, {
        step: 5,
        Component: ManageStep,
        extra: {
          roster: thirteen,
          registrationOpen: true,
          registrationDeadline: "2026-12-11",
        },
      })
    ),
  [
    "<strong>3</strong> of 6 registered",
    // Named, because "who registered" is a question about people.
    "Evelyn, Crys, Sofia",
    "Marcio, Paulo, Eni",
    "Still to register (3)",
    // And the ones nobody has written to yet.
    "1 person hasn't been emailed yet",
  ]
);

check(
  "and copes with an exchange nobody has joined",
  () =>
    renderToStaticMarkup(
      React.createElement(Harness, {
        step: 5,
        Component: ManageStep,
        extra: {
          roster: [
            { id: "a", name: "Crys", email: "c@example.com", status: "Invited" },
          ],
          registrationOpen: false,
          registrationDeadline: "2026-12-11",
        },
      })
    ),
  [
    // The count sits in its own element, so the number and the rest
    // of the sentence are not one string in the markup.
    "<strong>0</strong> of 1 registered",
    "Nobody yet.",
    "Registration has closed.",
  ]
);

// The organizer's one lever over messaging. Off for everybody or not
// at all: a per-person mute would single somebody out, and the
// organizer is the only person who can see every pairing.
const MessagingSetting = require(`${OUT}/pages/steps/MessagingSetting.js`).default;

function messaging(enabled) {
  return () =>
    renderToStaticMarkup(
      React.createElement(
        ExchangeContext.Provider,
        {
          value: {
            messagingEnabled: enabled,
            changeMessagingEnabled: async () => ({ ok: true }),
          },
        },
        React.createElement(MessagingSetting)
      )
    );
}

check(
  "messaging on says what people can do",
  messaging(true),
  [
    "Nobody learns who their own giver is",
    // The box has to agree with the setting, not just the words
    // underneath it.
    '<input type="checkbox" checked=""/>',
  ],
  // Switching it off is not the same as deleting what was written.
  ["Messaging is off"]
);

check(
  "and switching it off says what happens to what was already sent",
  messaging(false),
  ["Messaging is off for everyone", "stays readable", '<input type="checkbox"/>'],
  ['<input type="checkbox" checked=""/>']
);

// Editing an exchange that exists. The button used to say Create and
// mean it, which from "Edit Exchange" on the manage screen built a
// second exchange and orphaned the first.
const ReviewStep = require(`${OUT}/pages/steps/ReviewStep.js`).default;

check(
  "reviewing a new exchange offers to create it",
  () =>
    renderToStaticMarkup(
      React.createElement(Harness, {
        step: 2,
        Component: ReviewStep,
        extra: { eventCode: "" },
      })
    ),
  ["Create Gift Exchange"],
  ["Save Changes"]
);

check(
  "and reviewing one that exists offers to save it",
  () =>
    renderToStaticMarkup(
      React.createElement(Harness, {
        step: 2,
        Component: ReviewStep,
        extra: { eventCode: "ABC123" },
      })
    ),
  ["Save Changes"],
  ["Create Gift Exchange"]
);

// Restrictions. Two kinds sit in one list and look alike: the ones the
// organizer set, which are theirs to undo, and the ones a participant
// chose on their own page, which are not. The screen has to tell them
// apart, because the database refuses the second and an organizer
// clicking a box that silently fails learns nothing.
const InvitationStep = require(`${OUT}/pages/steps/InvitationStep.js`).default;

const restrictionEditor = {
  restrictionEditorId: "a",
  nameForInvitee: (id) =>
    ({ a: "Rowan Hale", b: "Mina Okafor", c: "Theo Barnes" })[id] ?? id,
  otherInvitees: () => [
    { id: "b", name: "Mina Okafor" },
    { id: "c", name: "Theo Barnes" },
  ],
  hasRestriction: (ownerId, otherId, direction) =>
    ownerId === "a" && direction === "give" &&
    (otherId === "b" || otherId === "c"),
  restrictionIsTheirs: (ownerId, otherId, direction) =>
    ownerId === "a" && otherId === "c" && direction === "give",
};

// Editing somebody fills the form at the top of the list. On a long
// list that is out of sight, so the screen has to say whose details
// are in it - otherwise the next move is to add the person again,
// which makes two of them and two people buying for one.
check(
  "editing somebody says whose details are in the form",
  () =>
    renderToStaticMarkup(
      React.createElement(Harness, {
        step: 4,
        Component: InvitationStep,
        extra: {
          editingInviteeId: "a",
          nameForInvitee: () => "Rowan Hale",
        },
      })
    ),
  [
    // The banner itself, not just the words, which appear elsewhere
    // on this screen: asserting on "Editing" alone passed with the
    // banner deleted.
    'class="editing-banner"',
    "Change what you need",
    "Rowan Hale",
    "Save Changes",
    "Cancel",
  ],
  ["Add Participant"]
);

check(
  "the invitation screen carries the button that actually sends them",
  () =>
    renderToStaticMarkup(
      React.createElement(Harness, {
        step: 4,
        Component: InvitationStep,
        extra: {
          invitationCounts: {
            pending: 3, invited: 0, registered: 0, waiting: 0,
          },
          sendInvitations: async () => ({ ok: true, queued: 0, skipped: 0 }),
        },
      })
    ),
  ["Email 3 people", "Invitation List"]
);

check(
  "a participant's own restriction is shown, but not as the organizer's to undo",
  () =>
    renderToStaticMarkup(
      React.createElement(Harness, {
        step: 4,
        Component: InvitationStep,
        extra: restrictionEditor,
      })
    ),
  [
    // Theirs: marked, and not something to click.
    'class="checkbox-inline restriction-theirs"><input type="checkbox" disabled="" checked=""/>Theo Barnes',
    "their choice",
    // The organizer's own, in the same list, still a working box.
    'class="checkbox-inline"><input type="checkbox" checked=""/>Mina Okafor',
  ],
  [
    // The old copy called the whole list the person's own choices,
    // which is the opposite of what the organizer mostly puts in it.
    "'s own choices",
    // A blanket disable would satisfy the first assertion and leave
    // the editor unusable.
    'class="checkbox-inline"><input type="checkbox" disabled=""',
  ]
);

// Inviting. The panel is the one control in the wizard that sends real
// email, so what it says before it is pressed is worth pinning down:
// how many people, and which of the two sends is on offer.
const SendInvitations = require(`${OUT}/pages/steps/SendInvitations.js`).default;

function invitations(counts) {
  return () =>
    renderToStaticMarkup(
      React.createElement(
        ExchangeContext.Provider,
        {
          value: {
            invitationCounts: counts,
            sendInvitations: async () => ({ ok: true, queued: 0, skipped: 0 }),
            saving: false,
          },
        },
        React.createElement(SendInvitations)
      )
    );
}

check(
  "the invitation panel says how many people have not been emailed",
  invitations({ pending: 3, invited: 0, registered: 0, waiting: 0 }),
  ["Email 3 people", "their own private registration link"],
  // Nothing to resend to yet, so that choice must not be offered.
  ["Send again to everybody"]
);

check(
  "and offers a resend once people have been emailed",
  invitations({ pending: 0, invited: 2, registered: 1, waiting: 0 }),
  ["Everybody on your list has been emailed", "Send again to everybody"],
  ["Email 1 person", "Email 2 people"]
);

check(
  "one person reads as one person, not 1 people",
  invitations({ pending: 1, invited: 0, registered: 0, waiting: 0 }),
  ["Email 1 person"],
  ["1 people"]
);

check(
  "and says so when invitations are already on their way",
  invitations({ pending: 0, invited: 2, registered: 0, waiting: 2 }),
  ["2 people already have an invitation in the queue", "goes out hourly"]
);

// Wrapped, because a panel that renders nothing is the point here and
// the harness rightly treats an empty render as a broken one.
/*
 * Not covered here: the panel's failure message. It only appears
 * after a click, and these checks render without one. Rendering the
 * message markup by hand would pass whatever the component did, so
 * there is no check rather than a check that cannot fail.
 */

check(
  "an exchange with nobody on the list offers nothing to send",
  () =>
    renderToStaticMarkup(
      React.createElement(
        ExchangeContext.Provider,
        {
          value: {
            invitationCounts: { pending: 0, invited: 0, registered: 0, waiting: 0 },
            sendInvitations: async () => ({ ok: true, queued: 0, skipped: 0 }),
            saving: false,
          },
        },
        React.createElement(
          "main",
          null,
          "Manage Exchange",
          React.createElement(SendInvitations)
        )
      )
    ),
  ["Manage Exchange"],
  ["Invitations", "Email"]
);

// An exchange that has not been saved yet knows no counts, and the
// panel must not guess at them from the list on screen.
check(
  "and neither does one that has not reached the database",
  () =>
    renderToStaticMarkup(
      React.createElement(
        ExchangeContext.Provider,
        { value: { invitationCounts: null, saving: false } },
        React.createElement(
          "main",
          null,
          "Gift Exchange Created",
          React.createElement(SendInvitations)
        )
      )
    ),
  ["Gift Exchange Created"],
  ["Invitations", "Email"]
);

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
const MessageThread = require(`${OUT}/pages/MessageThread.js`).default;

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
    onSetReminders: () => {},
        onSetReminders: () => {},
        onWithdraw: () => {},
      })
    ),
  [
    "You're in",
    // What was saved is what is shown: the fields are seeded from the
    // registration, not left blank for the person to retype.
    "A book about engines",
    "No chocolate, please",
    "Save changes",
    // Preferences, not guarantees: said plainly, because a draw can
    // need one of them set aside.
    "preferences, not guarantees",
    "Cancel my registration",
    // The emails tell people to turn reminders off on their page, so
    // the page has to offer it.
    "Send me reminders about deadlines and the draw",
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

// After the draw, the page has to show the name. The email says
// "open your page to see who" and puts the name nowhere else, so a
// page that cannot answer that leaves the person with no way to find
// out at all.
const drawnView = {
  ...registrationView,
  exchange: { ...registrationView.exchange, drawn: true },
  restrictionsOpen: false,
};

check(
  "the page shows who you drew once the draw has run",
  () =>
    renderToStaticMarkup(
      React.createElement(RegisteredView, {
        view: drawnView,
        assignment: {
          name: "Teo Vasquez",
          wishlist: "Anything with chili in it",
          preferences: "Allergic to shellfish",
        },
        onSave: () => {},
        onToggleRestriction: () => {},
        onSetReminders: () => {},
        onWithdraw: () => {},
      })
    ),
  [
    "You're buying for",
    "Teo Vasquez",
    "Anything with chili in it",
    "Allergic to shellfish",
  ],
  // The page must not still claim the name arrives by email.
  ["emailed the one name"]
);

check(
  "and says so plainly while the name is still loading",
  () =>
    renderToStaticMarkup(
      React.createElement(RegisteredView, {
        view: drawnView,
        assignment: null,
        onSave: () => {},
        onToggleRestriction: () => {},
        onSetReminders: () => {},
        onWithdraw: () => {},
      })
    ),
  ["The draw has happened"],
  ["You're buying for"]
);

/*
 * Arriving from an invitation, before registering.
 *
 * An invitation link always hands this browser a working token, and
 * the page used to take that as proof of registration: it said
 * "You're in" to somebody the database still had as Invited, who was
 * therefore not in the draw. Several people read that, believed it,
 * and closed the page.
 */
const invitedView = {
  ...registrationView,
  me: { ...registrationView.me, status: "Invited" },
};

check(
  "somebody who has not registered yet is told so",
  () =>
    renderToStaticMarkup(
      React.createElement(RegisteredView, {
        view: invitedView,
        onSave: () => {},
        onToggleRestriction: () => {},
        onSetReminders: () => {},
        onWithdraw: () => {},
      })
    ),
  [
    "You're almost registered",
    // The action, at the top, where they are already looking.
    '<div class="register-now">',
    "Register me",
  ],
  // The claim that started this.
  ["You're in", "You're registered for"]
);

check(
  "and somebody who has registered is not asked to again",
  () =>
    renderToStaticMarkup(
      React.createElement(RegisteredView, {
        view: registrationView,
        onSave: () => {},
        onToggleRestriction: () => {},
        onSetReminders: () => {},
        onWithdraw: () => {},
      })
    ),
  ["You're in", "Save changes"],
  ["You're almost registered", "register-now", "Register me"]
);

// Messaging. Two threads on one page, and the whole point of the app
// rests on the second one never naming anybody: a receiver writes to
// "Your Giver" and that is all they are ever told. These checks exist
// to fail if a name ever reaches that half of the screen.
const giverThread = {
  available: true,
  withName: "Teo Vasquez",
  withLabel: "Teo Vasquez",
  messages: [
    {
      id: "m1",
      from: "you",
      fromLabel: "You",
      body: "Any colors you'd rather avoid?",
      at: "2026-12-14T15:04:00Z",
    },
    {
      id: "m2",
      from: "them",
      fromLabel: "Teo Vasquez",
      body: "Nothing orange, please.",
      at: "2026-12-14T16:20:00Z",
    },
  ],
};

const receiverThread = {
  available: true,
  withName: null,
  withLabel: "Your Giver",
  messages: [
    {
      id: "m3",
      from: "them",
      fromLabel: "Your Giver",
      body: "Is the bakery voucher still a good idea?",
      at: "2026-12-14T17:00:00Z",
    },
  ],
};

check(
  "both threads appear once the draw has run",
  () =>
    renderToStaticMarkup(
      React.createElement(RegisteredView, {
        view: drawnView,
        assignment: { name: "Teo Vasquez" },
        threads: { giver: giverThread, receiver: receiverThread },
        onSave: () => {},
        onToggleRestriction: () => {},
        onSetReminders: () => {},
        onSendMessage: () => {},
        onReadThread: () => {},
        onWithdraw: () => {},
      })
    ),
  [
    "Messages with Teo Vasquez",
    "Messages with your giver",
    "Nothing orange, please.",
    "Is the bakery voucher still a good idea?",
    // The giver's half says plainly that writing does not give them away.
    "nothing you send here changes that",
  ],
  // Nothing anywhere may hint at who the giver is.
  ["Your Giver is", "your giver is"]
);

check(
  "the half you write to your giver in never names a person",
  () =>
    renderToStaticMarkup(
      React.createElement(MessageThread, {
        as: "receiver",
        thread: receiverThread,
        onSend: () => {},
        onRead: () => {},
      })
    ),
  ["Messages with your giver", "Write to your giver", "Your Giver"],
  // The one name in the fixture must not appear on this side at all.
  ["Teo Vasquez"]
);

check(
  "an organizer who switched messaging off takes the composer with it",
  () =>
    renderToStaticMarkup(
      React.createElement(MessageThread, {
        as: "giver",
        thread: { ...giverThread, canSend: false },
        onSend: () => {},
        onRead: () => {},
      })
    ),
  // The conversation stays readable; only the way in closes.
  ["Nothing orange, please.", "Messages are switched off"],
  ["Write to Teo Vasquez", ">Send<"]
);

check(
  "and there are no threads to show before the draw",
  () =>
    renderToStaticMarkup(
      React.createElement(RegisteredView, {
        view: registrationView,
        threads: {
          giver: { available: false, messages: [] },
          receiver: { available: false, messages: [] },
        },
        onSave: () => {},
        onToggleRestriction: () => {},
        onSetReminders: () => {},
        onSendMessage: () => {},
        onReadThread: () => {},
        onWithdraw: () => {},
      })
    ),
  [],
  ["Messages with", "Write to your giver"]
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
    onSetReminders: () => {},
        onSetReminders: () => {},
        onWithdraw: () => {},
      })
    ),
  ["too soon after", "matched at random", "let Dana Whitlock know"],
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
  ["too soon after", "matched at random", "let Dana Whitlock know"],
  [
    "you can come back and say who you would rather not",
    // Moving the draw date is the organizer's call, and asking a
    // participant to request it puts them in an awkward position
    // over something that affects everybody else's schedule.
    "move the draw date",
  ]
);

const { matchInviteeToken } = require(`${OUT}/router.js`);

// The token in a personal link is matched the same way as the
// management one, and the shapes that must not match matter as much
// as the shape that must.
check(
  "a personal link's token is recognized",
  () =>
    JSON.stringify([
      matchInviteeToken("/me/" + "a".repeat(64)),
      matchInviteeToken("/me/" + "a".repeat(64) + "/"),
      matchInviteeToken("/me/short"),
      matchInviteeToken("/me/" + "a".repeat(64) + "/extra"),
      matchInviteeToken("/event/ABC123"),
      matchInviteeToken("/me/" + "a".repeat(64) + "?x=1"),
    ]),
  [`"${"a".repeat(64)}","${"a".repeat(64)}",null,null,null,null`]
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
