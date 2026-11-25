import MessageThread from "./MessageThread";
import { restrictionWindow } from "../exchange/restrictionWindow";
import { useState } from "react";
import { REMINDERS_OFF_CONFIRMATION } from "../email/templates";
import { formatDate, giftBudgetLabel } from "../exchange/format";
import type { RestrictionDirection } from "../exchange/types";
import type {
  Assignment,
  RegistrationView,
  Thread,
  ThreadRole,
} from "../exchange/registration";
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
 * everybody returns at least once, since restrictions do not open
 * until registration closes. Being separate also means it can be
 * rendered on its own, which a branch behind a click cannot.
 *
 * Everything it shows is handed to it, and every change is handed
 * back: it holds no opinion about where the data came from, so the
 * same component renders a live exchange and a fixture.
 */
export default function RegisteredView({
  view,
  assignment,
  threads,
  busy,
  error,
  onSave,
  onToggleRestriction,
  onSetReminders,
  onSendMessage,
  onReadThread,
  onWithdraw,
}: {
  view: RegistrationView;
  assignment?: Assignment | null;
  threads?: Partial<Record<ThreadRole, Thread>>;
  busy?: boolean;
  error?: string | null;
  onSave: (fields: {
    name: string;
    wishlist: string;
    preferences: string;
  }) => void;
  onToggleRestriction: (
    otherId: string,
    direction: RestrictionDirection,
    on: boolean
  ) => void;
  onSetReminders: (wanted: boolean) => void;
  onSendMessage?: (as: ThreadRole, body: string) => void;
  onReadThread?: (as: ThreadRole) => void;
  onWithdraw: () => void;
}) {
  const { me, others, myRestrictions, exchange } = view;

  const [name, setName] = useState(me.name ?? "");
  const [wishlist, setWishlist] = useState(me.wishlist ?? "");
  const [preferences, setPreferences] = useState(me.preferences ?? "");
  const [saved, setSaved] = useState(false);

  /*
   * Busy is a fact about the page, not about one thread, so sending
   * in either one would otherwise put "Sending..." on both buttons.
   * Remembering which one was used narrows it to the right button; it
   * needs no clearing, since busy going false ends it either way.
   */
  const [sendingAs, setSendingAs] = useState<ThreadRole | null>(null);

  const sendIn = (as: ThreadRole) => (body: string) => {
    setSendingAs(as);
    onSendMessage?.(as, body);
  };

  const restrictionsWindow = restrictionWindow(
    exchange.registrationDeadline,
    exchange.drawDate
  );

  const hasRestriction = (
    otherId: string,
    direction: RestrictionDirection
  ) =>
    myRestrictions.some(
      (restriction) =>
        restriction.otherId === otherId &&
        restriction.direction === direction
    );

  const edited = (set: (value: string) => void) => (value: string) => {
    set(value);
    setSaved(false);
  };

  const restrictionList = (direction: RestrictionDirection) =>
    others.map((person) => (
      <label key={person.id} className="register-check">
        <input
          type="checkbox"
          checked={hasRestriction(person.id, direction)}
          disabled={busy}
          onChange={(e) =>
            onToggleRestriction(person.id, direction, e.target.checked)
          }
        />
        {person.name}
      </label>
    ));

  return (
    <>
      <h1>You're in</h1>

      <p className="content-lede">
        Thanks, {me.name || name}. You're registered for{" "}
        {exchange.name || "this exchange"}.
      </p>

      <dl className="register-facts">
        <div>
          <dt>Draw date</dt>
          <dd>{formatDate(exchange.drawDate)}</dd>
        </div>
        <div>
          <dt>Register by</dt>
          <dd>{formatDate(exchange.registrationDeadline)}</dd>
        </div>
        <div>
          <dt>Budget</dt>
          <dd>
            {giftBudgetLabel({
              giftBudget: exchange.giftBudget ?? "",
              giftBudgetNote: exchange.giftBudgetNote,
              currency: exchange.currency,
              noGiftLimit: exchange.noGiftLimit,
            })}
          </dd>
        </div>
      </dl>

      {error && (
        <p className="register-error" role="alert">
          {error}
        </p>
      )}

      {exchange.drawn && (
        <section className="assignment">
          {assignment?.name ? (
            <>
              <h2>You're buying for</h2>
              <p className="assignment-name">{assignment.name}</p>

              {assignment.wishlist ? (
                <>
                  <h3>What they asked for</h3>
                  <p className="assignment-note">{assignment.wishlist}</p>
                </>
              ) : (
                <p className="register-empty">
                  {assignment.name} didn't leave a wishlist.
                </p>
              )}

              {assignment.preferences && (
                <>
                  <h3>Worth knowing</h3>
                  <p className="assignment-note">
                    {assignment.preferences}
                  </p>
                </>
              )}

              <p className="helper-text">
                They don't know it's you, and there's no way for them
                to find out.
              </p>
            </>
          ) : (
            <>
              <h2>The draw has happened</h2>
              <p className="register-empty" role="status">
                Fetching the name you drew. If it doesn't appear,
                reload the page.
              </p>
            </>
          )}
        </section>
      )}

      {exchange.drawn && (threads?.giver?.available ||
        threads?.receiver?.available) && (
        <>
          <h2>Messages</h2>
          <p className="helper-text">
            Two separate conversations, and neither one tells anybody
            who drew whom.
          </p>

          <MessageThread
            as="giver"
            thread={threads?.giver}
            busy={busy && sendingAs === "giver"}
            onSend={sendIn("giver")}
            onRead={() => onReadThread?.("giver")}
          />

          <MessageThread
            as="receiver"
            thread={threads?.receiver}
            busy={busy && sendingAs === "receiver"}
            onSend={sendIn("receiver")}
            onRead={() => onReadThread?.("receiver")}
          />

          <hr />
        </>
      )}

      <h2>Your wishlist and preferences</h2>
      <p>
        Only the person who draws your name sees these. You won't
        know who that is, and they have no way to tell you. Change
        these as often as you like, up to the draw on{" "}
        {formatDate(exchange.drawDate)}.
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
        <input type="email" value={me.email} readOnly />
        <span className="register-hint">
          This is how the exchange knows you, so it can't be changed
          here. Ask {exchange.organizerName || "the organizer"} if it
          is wrong.
        </span>
      </label>

      <label className="register-field">
        Your wishlist
        <span className="register-hint">
          A few things you'd actually like, with enough detail to
          buy from: a size, a color, an author, a shop. Vague is harder
          to shop for than nothing at all. Say if you'd rather not
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
          Allergies, things you already have, or anything you'd
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
          disabled={busy}
          onClick={() => {
            onSave({ name, wishlist, preferences });
            setSaved(true);
          }}
        >
          {busy ? "Saving…" : "Save changes"}
        </button>

        {saved && !busy && !error && (
          <span className="register-saved" role="status">
            Saved.
          </span>
        )}
      </div>

      <h2>Who you'd rather not be matched with</h2>

      {!restrictionsWindow?.usable ? (
        /* No window at all: the draw follows the deadline too closely.
           Explaining how restrictions work and then saying they are
           unavailable would read as a fault with this page rather
           than a choice the organizer made. */
        <p className="register-empty">
          {exchange.name || "This exchange"} draws on{" "}
          {formatDate(exchange.drawDate)}, which is too soon after
          registration closes for anyone to set restrictions, so
          everyone is matched at random. If there's someone you'd
          rather not be matched with, let{" "}
          {exchange.organizerName || "the organizer"} know.
        </p>
      ) : (
        <>
      <p>
        These are preferences, not guarantees. The draw honors every
        one it can, but enough of them together can make a valid draw
        impossible, and the organizer may then have to set one aside to
        let the exchange happen at all. They would tell you if yours
        was the one.
      </p>
      <p>
        They work in one direction: not wanting to buy for someone is a
        different thing from not wanting them to buy for you. They're
        your own choices and don't appear on anyone else's list,
        though the organizer can see them, since they're the one who
        has to sort it out.
      </p>

      {exchange.drawn ? (
        <p className="register-empty">
          The draw has happened, so restrictions are closed.
        </p>
      ) : !view.restrictionsOpen ? (
        <p className="register-empty">
          Restrictions open when registration closes on{" "}
          {formatDate(exchange.registrationDeadline)}, once the list of
          people is final. You can set and change them from then until
          the draw on {formatDate(exchange.drawDate)}.
        </p>
      ) : others.length === 0 ? (
        <p className="register-empty">
          You're the only person registered so far, so there's nobody
          to set a restriction against.
        </p>
      ) : (
        <div className="register-restrictions">
          <section>
            <h3>I would rather not buy for</h3>
            {restrictionList("give")}
          </section>

          <section>
            <h3>I would rather not receive from</h3>
            {restrictionList("receive")}
          </section>
        </div>
      )}
        </>
      )}

      <h2>What happens next</h2>
      <ol className="register-next">
        <li>
          More people register until{" "}
          {formatDate(exchange.registrationDeadline)}.
        </li>
        <li>
          On {formatDate(exchange.drawDate)} everyone is matched at
          once, honoring every restriction that has been set.
        </li>
        <li>
          You're emailed to say the draw has happened, and this page
          shows the one name you're buying for. The name isn't in the
          email: it gets forwarded and left open on screens. Nobody sees
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

      <h2>Email</h2>
      <p>
        We'll email you when the draw happens and you have somebody to
        buy for, and when somebody in the exchange sends you a
        message. Those two always arrive. The rest are nudges, and
        they're yours to switch off.
      </p>

      <label className="register-check">
        <input
          type="checkbox"
          checked={!me.unsubscribed}
          disabled={busy}
          onChange={(e) => onSetReminders(e.target.checked)}
        />
        Send me reminders about deadlines and the draw
      </label>

      {me.unsubscribed && (
        <p className="register-empty" role="status">
          {REMINDERS_OFF_CONFIRMATION}
        </p>
      )}

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
          disabled={busy}
          onClick={() => {
            const confirmed = window.confirm(
              "Cancel your registration?\n\nYour wishlist, preferences, and restrictions will be deleted. You can register again from the same link."
            );

            if (confirmed) {
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
