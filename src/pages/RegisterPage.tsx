import { useState } from "react";
import Header from "../components/Header";
import SiteFooter from "../components/SiteFooter";
import RegisteredView from "./RegisteredView";
import { useExchangeContext } from "../exchange/context";
import { isValidEmail } from "../exchange/types";
import { navigate } from "../router";
import "./ContentPage.css";
import "./RegisterPage.css";

const WISHLIST_PLACEHOLDER =
  "A book I have been meaning to read\nSomething for the garden\nA voucher for the bakery on the corner";

const PREFERENCES_PLACEHOLDER =
  "Medium in most things. Please, no more candles.";

/**
 * Where an invitee lands from their registration link.
 *
 * Joining is this page; everything afterwards is RegisteredView.
 * Restrictions come after joining, not before: you cannot choose who
 * not to be matched with until you are in the list and can see who
 * else is.
 */
export default function RegisterPage({
  eventCode,
}: {
  eventCode: string;
}) {
  const {
    eventName,
    drawDate,
    registrationDeadline,
    giftBudgetLabel,
    registrationOpen,
    eventCode: openExchangeCode,
    formatDate,
    registerParticipant,
  } = useExchangeContext();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [wishlist, setWishlist] = useState("");
  const [preferences, setPreferences] = useState("");
  const [registeredId, setRegisteredId] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);

  // Without a backend this page can only show the exchange open in this
  // browser. A link opened anywhere else has nothing to look up.
  const exchangeIsHere =
    !!openExchangeCode && openExchangeCode === eventCode;

  const nameMissing = !name.trim();
  const emailInvalid = !isValidEmail(email);
  const canSubmit = !nameMissing && !emailInvalid;

  const join = () => {
    setAttempted(true);

    if (!canSubmit) {
      return;
    }

    setRegisteredId(
      registerParticipant({ name, email, wishlist, preferences })
    );
  };

  return (
    <>
      <Header onStartExchange={() => navigate("/create")} />

      <main className="content-page register-page">
        {!exchangeIsHere ? (
          <>
            <h1>This link needs a moment</h1>

            <p className="content-lede">
              Invitation code <strong>{eventCode}</strong>
            </p>

            <div className="register-notice">
              <h2>Exchanges are not stored yet</h2>
              <p>
                Mystery Name Draw currently runs entirely in the
                browser, so a registration link only opens in the same
                browser that created the exchange. Storing exchanges so
                that a link works for everyone is the next thing being
                built.
              </p>
              <p>
                To see this page working, create an exchange in this
                browser and follow its own registration link.
              </p>
            </div>
          </>
        ) : registeredId ? (
          <RegisteredView
            registeredId={registeredId}
            onWithdraw={() => setRegisteredId(null)}
          />
        ) : (
          <>
            <h1>Join {eventName || "this gift exchange"}</h1>

            <p className="content-lede">
              No account and no password. Fill this in and you are done.
            </p>

            <dl className="register-facts">
              <div>
                <dt>Draw date</dt>
                <dd>{formatDate(drawDate)}</dd>
              </div>
              <div>
                <dt>Register by</dt>
                <dd>{formatDate(registrationDeadline)}</dd>
              </div>
              <div>
                <dt>Budget</dt>
                <dd>{giftBudgetLabel}</dd>
              </div>
            </dl>

            {!registrationOpen && (
              <div className="register-notice">
                <h2>Registration is closed</h2>
                <p>
                  The organizer has stopped accepting new participants
                  for this exchange.
                </p>
              </div>
            )}

            <h2>Your details</h2>

            <label className="register-field">
              Your name *
              <input
                type="text"
                value={name}
                placeholder="The name others will see"
                onChange={(e) => setName(e.target.value)}
              />
              {attempted && nameMissing && (
                <span className="validation-error">
                  Please enter a name.
                </span>
              )}
            </label>

            <label className="register-field">
              Your email *
              <input
                type="email"
                value={email}
                placeholder="you@example.com"
                onChange={(e) => setEmail(e.target.value)}
              />
              {attempted && emailInvalid && (
                <span className="validation-error">
                  This is where your match is sent, so it needs to be
                  right.
                </span>
              )}
            </label>

            <h2>Your wishlist</h2>
            <p>
              Ideas for whoever draws your name. Only they will see it.
              Give them enough to buy from: a size, a color, an author,
              a shop. Vague is harder to shop for than nothing at all.
            </p>

            <label className="register-field">
              <span className="visually-hidden">Your wishlist</span>
              <textarea
                rows={5}
                value={wishlist}
                placeholder={WISHLIST_PLACEHOLDER}
                onChange={(e) => setWishlist(e.target.value)}
              />
            </label>

            <h2>Anything else worth knowing</h2>
            <p>
              Sizes, colors you like, or things to steer clear of.
              Optional, and often more useful than the wishlist.
            </p>

            <label className="register-field">
              <span className="visually-hidden">
                Anything else worth knowing
              </span>
              <textarea
                rows={4}
                value={preferences}
                placeholder={PREFERENCES_PLACEHOLDER}
                onChange={(e) => setPreferences(e.target.value)}
              />
            </label>

            <div className="register-actions">
              <button
                type="button"
                className="landing-cta register-submit"
                onClick={join}
                disabled={!registrationOpen}
              >
                Confirm Registration
              </button>

              {/* Nobody has to join because a link arrived. This leaves
                  without registering, and the link still works later. */}
              <button
                type="button"
                className="register-cancel"
                onClick={() => navigate("/")}
              >
                Cancel
              </button>
            </div>

            <p className="register-after">
              Once registration closes on{" "}
              {formatDate(registrationDeadline)} you can come back and
              say who you would rather not be matched with, right up
              until the draw on {formatDate(drawDate)}. Not sure?{" "}
              <a href="#/faq">The questions people ask</a> covers how
              this works.
            </p>
          </>
        )}
      </main>

      <SiteFooter />
    </>
  );
}
