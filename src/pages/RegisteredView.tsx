import { useState } from "react";
import { useExchangeContext } from "../exchange/context";
import "./RegisterPage.css";

const WISHLIST_PLACEHOLDER =
  "A book I have been meaning to read\nSomething for the garden\nA voucher for the bakery on the corner";

const PREFERENCES_PLACEHOLDER =
  "Medium in most things. Please, no more candles.";

/**
 * What a registered person sees on their own page.
 *
 * Its own component rather than a branch inside RegisterPage, because
 * it is a screen people come back to rather than a thank-you: almost
 * everybody returns at least once, since restrictions do not open until
 * registration closes. Being separate also means it can be rendered on
 * its own, which a branch behind a click cannot.
 *
 * It reads the current values from the exchange rather than being
 * handed them, so what it shows is what was saved.
 */
export default function RegisteredView({
  registeredId,
  onWithdraw,
}: {
  registeredId: string;
  onWithdraw: () => void;
}) {
  const {
    invitees,
    participants,
    eventName,
    drawDate,
    registrationDeadline,
    restrictionsOpen,
    drawHasPassed,
    formatDate,
    hasRestriction,
    setRestriction,
    updateRegistration,
    withdrawRegistration,
  } = useExchangeContext();

  const me = invitees.find((invitee) => invitee.id === registeredId);

  const [name, setName] = useState(me?.name ?? "");
  const [wishlist, setWishlist] = useState(me?.wishlist ?? "");
  const [preferences, setPreferences] = useState(me?.preferences ?? "");
  const [saved, setSaved] = useState(false);

  const others = participants.filter(
    (person) => person.id !== registeredId
  );

  const edited = (set: (value: string) => void) => (value: string) => {
    set(value);
    setSaved(false);
  };

  return (
    <>
      <h1>You are in</h1>

      <p className="content-lede">
        Thanks, {me?.name || name}. You are registered for{" "}
        {eventName || "this exchange"}.
      </p>

      <h2>Your wishlist and preferences</h2>
      <p>
        Only the person who draws your name sees these. You will not
        know who that is, and they have no way to tell you. Change these
        as often as you like, up to the draw on {formatDate(drawDate)}.
      </p>

      <label className="register-field">
        Your name
        <input
          type="text"
          value={name}
          onChange={(e) => edited(setName)(e.target.value)}
        />
      </label>

      <label className="register-field">
        Your email
        <input type="email" value={me?.email ?? ""} readOnly />
        <span className="register-hint">
          This is how the exchange knows you, so it cannot be changed
          here. Ask the organizer if it is wrong.
        </span>
      </label>

      <label className="register-field">
        Your wishlist
        <span className="register-hint">
          A few things you would actually like, with enough detail to
          buy from: a size, a color, an author, a shop. Vague is harder
          to shop for than nothing at all. Say if you would rather not
          receive something, too.
        </span>
        <textarea
          rows={5}
          value={wishlist}
          placeholder={WISHLIST_PLACEHOLDER}
          onChange={(e) => edited(setWishlist)(e.target.value)}
        />
      </label>

      <label className="register-field">
        Anything else worth knowing
        <span className="register-hint">
          Allergies, things you already have, or anything you would
          rather avoid. Often more useful than the wishlist.
        </span>
        <textarea
          rows={4}
          value={preferences}
          placeholder={PREFERENCES_PLACEHOLDER}
          onChange={(e) => edited(setPreferences)(e.target.value)}
        />
      </label>

      <div className="register-save-row">
        <button
          type="button"
          className="landing-cta register-submit"
          onClick={() => {
            updateRegistration(registeredId, {
              name,
              wishlist,
              preferences,
            });
            setSaved(true);
          }}
        >
          Save changes
        </button>

        {saved && (
          <span className="register-saved" role="status">
            Saved.
          </span>
        )}
      </div>

      <h2>Who you would rather not be matched with</h2>
      <p>
        These are preferences, not guarantees. The draw honors every one
        it can, but enough of them together can make a valid draw
        impossible, and the organizer may then have to set one aside to
        let the exchange happen at all. They would tell you if yours was
        the one.
      </p>
      <p>
        They work in one direction: not wanting to buy for someone is a
        different thing from not wanting them to buy for you. They are
        your own choices and do not appear on anyone else&rsquo;s list,
        though the organizer can see them, since they are the one who
        has to sort it out.
      </p>

      {drawHasPassed ? (
        <p className="register-empty">
          The draw has happened, so restrictions are closed.
        </p>
      ) : !restrictionsOpen ? (
        <p className="register-empty">
          Restrictions open when registration closes on{" "}
          {formatDate(registrationDeadline)}, once the list of people is
          final. You can set and change them from then until the draw on{" "}
          {formatDate(drawDate)}.
        </p>
      ) : others.length === 0 ? (
        <p className="register-empty">
          You are the only person registered so far, so there is nobody
          to set a restriction against.
        </p>
      ) : (
        <div className="register-restrictions">
          <section>
            <h3>I would rather not buy for</h3>
            {others.map((person) => (
              <label key={person.id} className="register-check">
                <input
                  type="checkbox"
                  checked={hasRestriction(registeredId, person.id, "give")}
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
              <label key={person.id} className="register-check">
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
          honoring every restriction that has been set.
        </li>
        <li>
          You are emailed the one name you are buying for. Nobody sees
          the full set of matches, including whoever organized the
          exchange.
        </li>
      </ol>

      <p className="content-updated">
        Come back to this page any time before the draw. Restrictions
        save as you tick them; the wishlist and preferences save when
        you press the button. More in the{" "}
        <a href="#/faq">questions people ask</a>.
      </p>

      <div className="register-withdraw">
        <h2>Changed your mind?</h2>
        <p>
          You can take yourself out of this exchange up until the draw.
          What you wrote and the restrictions you set are deleted; the
          organizer sees you as invited but not registered, and you can
          join again from the same link.
        </p>

        <button
          type="button"
          className="register-cancel"
          onClick={() => {
            const confirmed = window.confirm(
              "Cancel your registration?\n\nYour wishlist, preferences, and restrictions will be deleted. You can register again from the same link."
            );

            if (confirmed) {
              withdrawRegistration(registeredId);
              onWithdraw();
            }
          }}
        >
          Cancel my registration
        </button>
      </div>
    </>
  );
}
