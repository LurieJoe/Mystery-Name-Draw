import { useState } from "react";
import { useExchangeContext } from "../../exchange/context";

/**
 * Emailing the people on the list.
 *
 * Shown on the confirmation screen and again on the manage screen,
 * because the two moments it is wanted are "the exchange is ready"
 * and "I have just added somebody". The counts come from the
 * database, so a second device, or a person who opted out, is
 * reflected here rather than guessed at from the list on screen.
 *
 * Nothing is sent without a click. An email is the one thing in this
 * app that cannot be taken back, and an address typed wrong is only
 * noticed once it has been looked at.
 */
export default function SendInvitations() {
  const { invitationCounts, sendInvitations, saving } =
    useExchangeContext();

  const [result, setResult] = useState<string | null>(null);
  const [confirmingResend, setConfirmingResend] = useState(false);

  if (!invitationCounts) return null;

  const { pending, invited, registered, waiting } = invitationCounts;

  const total = pending + invited + registered;

  if (total === 0) return null;

  const people = (count: number) =>
    count === 1 ? "1 person" : `${count} people`;

  const send = async (resend: boolean) => {
    setResult(null);
    setConfirmingResend(false);

    const outcome = await sendInvitations(resend);

    if (!outcome.ok) return;

    setResult(
      outcome.queued === 0
        ? "Nothing to send: everybody is either already invited or waiting."
        : `${people(outcome.queued)} will get an invitation.` +
            (outcome.skipped > 0
              ? ` ${people(outcome.skipped)} opted out of email and were left alone.`
              : "")
    );
  };

  return (
    <div className="send-invitations">
      <h3>Invitations</h3>

      <p className="helper-text">
        {pending > 0
          ? `${people(pending)} on your list haven't been emailed yet. ` +
            `Each one gets their own private registration link, so you ` +
            `don't have to share the code by hand.`
          : `Everybody on your list has been emailed. Add somebody and ` +
            `this will offer to invite just them.`}
      </p>

      {waiting > 0 && (
        <p className="helper-text">
          {people(waiting)} already have an invitation in the queue. Email
          goes out hourly, so give it a little while.
        </p>
      )}

      <div className="invitation-actions">
        <button
          type="button"
          className="primary-button"
          onClick={() => void send(false)}
          disabled={saving || pending === 0}
        >
          {saving
            ? "Sending..."
            : pending > 0
            ? `Email ${people(pending)}`
            : "Nobody new to email"}
        </button>

        {invited > 0 && !confirmingResend && (
          <button
            type="button"
            className="secondary-button"
            onClick={() => setConfirmingResend(true)}
            disabled={saving}
          >
            Send again to everybody who hasn't registered
          </button>
        )}
      </div>

      {confirmingResend && (
        <div className="invitation-confirm">
          <p>
            This emails {people(invited + pending)} a second time &mdash;
            everybody who hasn't registered yet. Useful if the first batch
            landed in junk folders.
          </p>

          <div className="invitation-actions">
            <button
              type="button"
              className="primary-button"
              onClick={() => void send(true)}
              disabled={saving}
            >
              {saving ? "Sending..." : "Yes, send again"}
            </button>

            <button
              type="button"
              className="secondary-button"
              onClick={() => setConfirmingResend(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {result && (
        <p className="invitation-result" role="status">
          {result}
        </p>
      )}
    </div>
  );
}
