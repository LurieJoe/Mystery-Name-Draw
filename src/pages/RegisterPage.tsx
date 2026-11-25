import Header from "../components/Header";
import SiteFooter from "../components/SiteFooter";
import JoinForm from "./JoinForm";
import RegisteredView from "./RegisteredView";
import { useRegistration } from "../exchange/useRegistration";
import { navigate } from "../router";
import "./ContentPage.css";
import "./RegisterPage.css";

/**
 * Where an invitee lands from their registration link.
 *
 * This page decides which of two screens to show and nothing else.
 * Both of them are presentational, and the state behind them comes
 * from useRegistration, which talks to the database rather than to the
 * organizer's copy of the exchange. That is the whole difference
 * between a link that works and one that only worked in the browser
 * that made it.
 */
export default function RegisterPage({
  eventCode,
}: {
  eventCode: string;
}) {
  const {
    state,
    assignment,
    threads,
    busy,
    error,
    retry,
    join,
    save,
    toggleRestriction,
    setReminders,
    sendMessage,
    readThread,
    withdraw,
  } = useRegistration(eventCode);

  return (
    <>
      <Header onStartExchange={() => navigate("/create")} />

      <main className="content-page register-page">
        {state.kind === "loading" && (
          <>
            <h1>Opening your invitation</h1>
            <p className="content-lede">
              Invitation code <strong>{eventCode}</strong>
            </p>
            <p className="register-empty" role="status">
              One moment.
            </p>
          </>
        )}

        {state.kind === "registered" && (
          <RegisteredView
            view={state.view}
            assignment={assignment}
            threads={threads}
            busy={busy}
            error={error}
            onSave={save}
            onToggleRestriction={toggleRestriction}
            onSetReminders={setReminders}
            onSendMessage={sendMessage}
            onReadThread={readThread}
            onWithdraw={withdraw}
          />
        )}

        {state.kind === "join" && (
          <JoinForm
            preview={state.preview}
            busy={busy}
            error={error}
            onJoin={join}
            onCancel={() => navigate("/")}
          />
        )}

        {state.kind === "missing" && (
          <>
            <h1>That link didn't open anything</h1>

            <p className="content-lede">
              Invitation code <strong>{eventCode}</strong>
            </p>

            <div className="register-notice">
              <h2>No exchange with that code</h2>
              <p>
                The code may have been mistyped, the link may have been
                cut short by whatever it was sent through, or the
                organizer may have deleted the exchange. Ask them for
                the link again.
              </p>
            </div>
          </>
        )}

        {state.kind === "unreachable" && (
          <>
            <h1>Couldn't reach Mystery Name Draw</h1>

            <p className="content-lede">
              Invitation code <strong>{eventCode}</strong>
            </p>

            <div className="register-notice">
              <h2>Nothing answered</h2>
              <p>
                Your link is probably fine. Check your connection and
                try again.
              </p>
              <button
                type="button"
                className="secondary-button"
                onClick={() => void retry()}
              >
                Try again
              </button>
            </div>
          </>
        )}

        {state.kind === "no-database" && (
          <>
            <h1>This link needs a moment</h1>

            <p className="content-lede">
              Invitation code <strong>{eventCode}</strong>
            </p>

            <div className="register-notice">
              <h2>Not connected to a database</h2>
              <p>
                This copy of Mystery Name Draw was built without the
                settings it needs to look an exchange up, so it can't
                open this link. That's something to fix where the site
                is built, not on this page.
              </p>
            </div>
          </>
        )}
      </main>

      <SiteFooter />
    </>
  );
}
