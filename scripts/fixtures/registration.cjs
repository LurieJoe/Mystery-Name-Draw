/*
 * One fixture for both the smoke render and the preview renderer, so
 * what gets screenshotted is what gets checked.
 *
 * It is the shape registration_view and exchange_preview return, not
 * an approximation of it: if the SQL changes and this does not, the
 * smoke checks go on passing against a shape the database no longer
 * sends. The tests in supabase/tests are what hold the real shape
 * honest; this is here so the screens can be rendered without one.
 *
 * Invented names throughout. A placeholder name on a "would rather
 * not be matched with" list is a real person's name in a disparaging
 * position, so none of these belong to anybody.
 */

const exchangePreview = {
  name: "Office Secret Santa",
  giftBudget: "25",
  currency: "USD",
  noGiftLimit: false,
  registrationDeadline: "2026-12-11",
  drawDate: "2026-12-16",
  organizerName: "Dana Whitlock",
  registrationOpen: true,
  openToAnyone: true,
  drawn: false,
};

const registrationView = {
  exchange: {
    name: "Office Secret Santa",
    giftBudget: "25",
    currency: "USD",
    noGiftLimit: false,
    registrationDeadline: "2026-12-11",
    drawDate: "2026-12-16",
    organizerName: "Dana Whitlock",
    drawn: false,
  },
  registrationOpen: false,
  restrictionsOpen: true,
  me: {
    id: "a",
    name: "Rowan Hale",
    email: "rowan@example.com",
    status: "Registered",
    wishlist: "A book about engines",
    preferences: "No chocolate, please",
    unsubscribed: false,
  },
  others: [
    { id: "b", name: "Mina Okafor" },
    { id: "c", name: "Teo Vasquez" },
  ],
  myRestrictions: [{ otherId: "c", direction: "give" }],
};

module.exports = { exchangePreview, registrationView };
