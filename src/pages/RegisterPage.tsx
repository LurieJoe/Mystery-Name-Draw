import Header from "../components/Header";
import { navigate } from "../router";

/**
 * Where an invitee lands from their registration link.
 *
 * A placeholder for now: registration needs the exchange to be stored
 * somewhere both the organizer and the invitee can reach, so there is
 * nothing to look the code up in yet.
 */
export default function RegisterPage({
  eventCode,
}: {
  eventCode: string;
}) {
  return (
    <>
      <Header onStartExchange={() => navigate("/")} />

      <div className="create-event-page">
        <div className="wizard-card">
          <h2>Register for this gift exchange</h2>

          <p className="step-description">
            Invitation code <strong>{eventCode}</strong>
          </p>

          <div className="draw-status draw-status-waiting">
            <h3>Registration is not ready yet</h3>

            <p>
              This page will ask for your name and email, let you add
              gift preferences, and let you set your own restrictions:
              anyone you would rather not give to or receive from.
            </p>

            <p className="helper-text">
              It needs the exchange to be stored somewhere both the
              organizer and you can reach, which is not built yet.
            </p>
          </div>

          <div className="wizard-navigation">
            <button
              type="button"
              className="back-button"
              onClick={() => navigate("/")}
            >
              ← Back to the organizer
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
