import { useState } from "react";
import Header from "../components/Header";
import SiteFooter from "../components/SiteFooter";
import { useExchangeContext } from "../exchange/context";
import { isValidEmail } from "../exchange/types";
import { navigate } from "../router";
import "./ContentPage.css";
import "./RegisterPage.css";

/**
 * Where an invitee lands from their registration link.
 *
 * Restrictions come after joining, not before: you cannot choose who
 * not to be matched with until you are in the list and can see who else
 * is. The roster also grows as other people register, which is why this
 * page stays reachable afterwards rather than being a one-shot form.
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
    participants,
    registerParticipant,
    hasRestriction,
    setRestriction,
    nameForInvitee,
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

  const others = registeredId
    ? participants.filter((person) => person.id !== registeredId)
    : [];

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
          <>
            <h1>You are in</h1>

            <p className="content-lede">
              Thanks, {nameForInvitee(registeredId)}. You are registered
              for {eventName || "this exchange"}.
            </p>

            <h2>Who you would rather not be matched with</h2>
            <p>
              These are your choices alone. Nobody else sees them, and
              they work in one direction: not wanting to buy for someone
              is a different thing from not wanting them to buy for you.
            </p>

            {others.length === 0 ? (
              <p className="register-empty">
                You are the first to register. Come back once others
                have joined and you can set these then.
              </p>
            ) : (
              <div className="register-restrictions">
                <section>
                  <h3>I would rather not buy for</h3>
                  {others.map((person) => (
                    <label
                      key={person.id}
                      className="register-check"
                    >
                      <input
                        type="checkbox"
                        checked={hasRestriction(
                          registeredId,
                          person.id,
                          "give"
                        )}
                        onChange={(e) =>
                          setRestriction(
                            registeredId,
                            person.id,
                            "give",
                            e.target.checked
                          )
                        }
                      />
                      {person.name}
                    </label>
                  ))}
                </section>

                <section>
                  <h3>I would rather not receive from</h3>
                  {others.map((person) => (
                    <label
                      key={person.id}
                      className="register-check"
                    >
                      <input
                        type="checkbox"
                        checked={hasRestriction(
                          registeredId,
                          person.id,
                          "receive"
                        )}
                        onChange={(e) =>
                          setRestriction(
                            registeredId,
                            person.id,
                            "receive",
                            e.target.checked
                          )
                        }
                      />
                      {person.name}
                    </label>
                  ))}
                </section>
              </div>
            )}

            <h2>What happens next</h2>
            <ol className="register-next">
              <li>
                More people register until{" "}
                {formatDate(registrationDeadline)}.
              </li>
              <li>
                On {formatDate(drawDate)} everyone is matched at once,
                honouring every restriction that has been set.
              </li>
              <li>
                You are emailed the one name you are buying for. Nobody
                sees the full set of matches, including whoever
                organized the exchange.
              </li>
            </ol>

            <p className="content-updated">
              Changed your mind? This page stays open, and your choices
              save as you tick them.
            </p>
          </>
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
              Ideas for whoever draws your name. Only they will see it,
              and they will not know you wrote it for them.
            </p>

            <label className="register-field">
              <textarea
                rows={5}
                value={wishlist}
                placeholder={
                  "A book I have been meaning to read\nSomething for the garden\nA voucher for the bakery on the corner"
                }
                onChange={(e) => setWishlist(e.target.value)}
              />
            </label>

            <h2>Anything else worth knowing</h2>
            <p>
              Sizes, colours you like, or things to steer clear of.
              Optional, and often more useful than the wishlist.
            </p>

            <label className="register-field">
              <textarea
                rows={4}
                value={preferences}
                placeholder="Medium in most things. Please, no more candles."
                onChange={(e) => setPreferences(e.target.value)}
              />
            </label>

            <button
              type="button"
              className="landing-cta register-submit"
              onClick={join}
              disabled={!registrationOpen}
            >
              Join the exchange
            </button>

            <p className="register-after">
              You will be able to set who you would rather not be
              matched with once you are in and can see who else has
              joined.
            </p>
          </>
        )}
      </main>

      <SiteFooter />
    </>
  );
}
