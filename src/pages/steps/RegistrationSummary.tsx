import { ORGANIZER_ID, REGISTERED, INVITE_PENDING } from "../../exchange/types";
import { useExchangeContext } from "../../exchange/context";

/**
 * Who is in, answered on arrival.
 *
 * The management link used to open the wizard at step one, so an
 * organizer wanting to know who had registered walked four screens
 * and scrolled each one. The counts and the names were there the
 * whole time, at the bottom of a list on another page. This is the
 * same information, first.
 *
 * Read from the roster rather than from invitation_counts, because
 * the roster is already loaded and includes the organizer when they
 * are taking part, which is what makes the totals add up to the
 * number of people who will be in the draw.
 */
export default function RegistrationSummary() {
  const { roster, registrationOpen, registrationDeadline, formatDate } =
    useExchangeContext();

  if (roster.length === 0) return null;

  const registered = roster.filter(
    (person) => person.id === ORGANIZER_ID || person.status === REGISTERED
  );

  const waiting = roster.filter(
    (person) => person.id !== ORGANIZER_ID && person.status !== REGISTERED
  );

  const uninvited = waiting.filter(
    (person) => person.status === INVITE_PENDING
  );

  const names = (people: { name: string }[]) =>
    people.map((person) => person.name).join(", ");

  return (
    <div className="registration-summary">
      <p className="summary-headline">
        <strong>{registered.length}</strong> of {roster.length} registered
      </p>

      <p className="helper-text">
        {registrationOpen
          ? `Registration is open until ${formatDate(registrationDeadline)}.`
          : "Registration has closed."}
        {uninvited.length > 0 &&
          ` ${uninvited.length} ${
            uninvited.length === 1 ? "person hasn't" : "people haven't"
          } been emailed yet.`}
      </p>

      <div className="summary-lists">
        <div>
          <h4>In ({registered.length})</h4>
          <p>{registered.length > 0 ? names(registered) : "Nobody yet."}</p>
        </div>

        <div>
          <h4>Still to register ({waiting.length})</h4>
          <p>{waiting.length > 0 ? names(waiting) : "Everybody is in."}</p>
        </div>
      </div>
    </div>
  );
}
