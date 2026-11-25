import { restrictionWindow } from "../exchange/restrictionWindow";
import { useState } from "react";
import { formatDate, giftBudgetLabel } from "../exchange/format";
import { isValidEmail } from "../exchange/types";
import type { ExchangePreview } from "../exchange/registration";
import "./RegisterPage.css";

const WISHLIST_PLACEHOLDER =
  "A book I have been meaning to read\nSomething for the garden\nA voucher for the bakery on the corner";

const PREFERENCES_PLACEHOLDER =
  "Medium in most things. Please, no more candles.";

/**
 * Joining an exchange from its link.
 *
 * Restrictions are deliberately not here. You cannot sensibly choose
 * who not to be matched with until you are in the list and can see who
 * else is, so they live on the page you come back to, and open when
 * registration closes.
 *
 * Presentational, like RegisteredView: it is handed a preview and
 * hands back what was typed.
 */
export default function JoinForm({
  preview,
  busy,
  error,
  onJoin,
  onCancel,
}: {
  preview: ExchangePreview;
  busy?: boolean;
  error?: string | null;
  onJoin: (fields: {
    name: string;
    email: string;
    wishlist: string;
    preferences: string;
  }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [wishlist, setWishlist] = useState("");
  const [preferences, setPreferences] = useState("");
  const [attempted, setAttempted] = useState(false);

  const restrictionsWindow = restrictionWindow(
    preview.registrationDeadline,
    preview.drawDate
  );

  const nameMissing = !name.trim();
  const emailInvalid = !isValidEmail(email);

  const submit = () => {
    setAttempted(true);

    if (nameMissing || emailInvalid) {
      return;
    }

    onJoin({ name, email, wishlist, preferences });
  };

  return (
    <>
      <h1>Join {preview.name || "this gift exchange"}</h1>

      <p className="content-lede">
        No account and no password. Fill this in and you're done.
      </p>

      <dl className="register-facts">
        <div>
          <dt>Draw date</dt>
          <dd>{formatDate(preview.drawDate)}</dd>
        </div>
        <div>
          <dt>Register by</dt>
          <dd>{formatDate(preview.registrationDeadline)}</dd>
        </div>
        <div>
          <dt>Budget</dt>
          <dd>
            {giftBudgetLabel({
              giftBudget: preview.giftBudget ?? "",
              giftBudgetNote: preview.giftBudgetNote,
              currency: preview.currency,
              noGiftLimit: preview.noGiftLimit,
            })}
          </dd>
        </div>
      </dl>

      {!preview.registrationOpen && (
        <div className="register-notice">
          <h2>Registration is closed</h2>
          <p>
            {preview.drawn
              ? "The draw has already happened for this exchange."
              : `Registration closed on ${formatDate(
                  preview.registrationDeadline
                )}.`}{" "}
            Ask {preview.organizerName || "the organizer"} whether
            there's still room.
          </p>
        </div>
      )}

      {/* Worth saying before they type anything in, rather than
          turning them away afterwards. */}
      {preview.registrationOpen && !preview.openToAnyone && (
        <div className="register-notice">
          <h2>This one is invitation only</h2>
          <p>
            {preview.organizerName || "The organizer"} chose who's in
            this exchange, so use the email address your invitation was
            sent to. Any other address is turned away.
          </p>
        </div>
      )}

      {error && (
        <p className="register-error" role="alert">
          {error}
        </p>
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
          <span className="validation-error">Please enter a name.</span>
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
            This is where your match is sent, so it needs to be right.
          </span>
        )}
      </label>

      <h2>Your wishlist</h2>
      <p>
        Ideas for whoever draws your name. Only they'll see it. Give
        them enough to buy from: a size, a color, an author, a shop.
        Vague is harder to shop for than nothing at all.
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
        Sizes, colors you like, or things to steer clear of. Optional,
        and often more useful than the wishlist.
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
          onClick={submit}
          disabled={!preview.registrationOpen || busy}
        >
          {busy ? "Registering…" : "Confirm Registration"}
        </button>

        {/* Nobody has to join because a link arrived. This leaves
            without registering, and the link still works later. */}
        <button
          type="button"
          className="register-cancel"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>

      <p className="register-after">
        {restrictionsWindow?.usable ? (
          <>
            Once registration closes on{" "}
            {formatDate(preview.registrationDeadline)} you can come
            back and say who you'd rather not be matched with,
            right up until the draw on{" "}
            {formatDate(preview.drawDate)}.{" "}
          </>
        ) : (
          /* The organizer set the draw too soon after the deadline
             for a restriction window to exist. Promising one here
             would be a promise this exchange cannot keep. */
          <>
            This exchange draws on{" "}
            {formatDate(preview.drawDate)}, too soon after
            registration closes for restrictions, so everyone is
            matched at random. If there's someone you'd rather not be
            matched with, let{" "}
            {preview.organizerName || "the organizer"} know.{" "}
          </>
        )}
        Not sure? <a href="#/faq">The questions people ask</a> covers
        how this works.
      </p>
    </>
  );
}
