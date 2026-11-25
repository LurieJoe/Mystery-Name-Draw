import { restrictionWindow } from "../../exchange/restrictionWindow";
import { useExchangeContext } from "../../exchange/context";

/** Step 1: name, dates, budget, reminders, and organizer details. */
export default function SettingsStep() {
  const {
    eventName,
    setEventName,
    setCurrentStep,
    currency,
    setCurrency,
    includeOrganizer,
    setIncludeOrganizer,
    organizerName,
    setOrganizerName,
    organizerEmail,
    setOrganizerEmail,
    registrationDateTouched,
    setRegistrationDateTouched,
    registrationDeadline,
    setRegistrationDeadline,
    drawDate,
    setDrawDate,
    giftBudget,
    setGiftBudget,
    noGiftLimit,
    setNoGiftLimit,
    remindBeforeRegistrationDeadline,
    setRemindBeforeRegistrationDeadline,
    remindBeforeDrawDate,
    setRemindBeforeDrawDate,
    registrationDateValid,
    registrationDeadlineInPast,
    formValid,
    handleImportFile,
    organizerNameMissing,
    organizerEmailMissing,
    organizerEmailInvalid,
    organizerDetailsValid,
    showOrganizerErrors,
    setOrganizerTouched,
  } = useExchangeContext();

  /* How long people actually get to set restrictions, which is not
     the gap between the two dates: see restrictionWindow. */
  const restrictionsWindow = restrictionWindow(registrationDeadline, drawDate);

  return (
    <>
      <div className="wizard-header">
        <h1>Start a Gift Exchange</h1>
        <p>Step 1 of 3</p>
      </div>

      <div className="wizard-card">


      <div className="settings-heading-row">
        <h2>Gift Exchange Settings</h2>

        <label className="secondary-button file-button">
          Import Exchange / Template
          <input
            type="file"
            accept="application/json,.json"
            onChange={handleImportFile}
          />
        </label>
      </div>

      <p className="step-description">
        Configure important details for your gift exchange.
      </p>
      <div className="event-name-field">
      <label>
          Gift Exchange Name *  </label>

          {!eventName.trim() && (
      <p className="validation-error">
        Please enter a name for your gift exchange.
      </p>
    )}

      <div className="event-name-row">

        <input
          type="text"
          placeholder="Name of Gift Exchange event"
          value={eventName}
          onChange={(e) => setEventName(e.target.value)}
        />

        <button
          type="button"
          className="secondary-button"
          onClick={() => setEventName("")}
        >
          Clear
        </button>

      </div>
    </div>
      <div className="settings-layout">

      <div className="settings-left">

    <div className="date-row">

      <div className="date-field">

    <label>
      Name Draw Date *
      <input
        type="date"
        value={drawDate}
        onChange={(e) => {
          const draw = e.target.value;

          setDrawDate(draw);

          if (!registrationDateTouched && draw) {
            const drawDateObj = new Date(draw);

            drawDateObj.setDate(
              drawDateObj.getDate() - 5
            );

            const registrationDate =
              drawDateObj
                .toISOString()
                .split("T")[0];

            setRegistrationDeadline(
              registrationDate
            );
          }
        }}
      />
    </label>
    </div>

    <div className="date-field">

    <label>
      Registration Deadline *

      <input
        type="date"
        value={registrationDeadline}
        onChange={(e) => {
          setRegistrationDeadline(e.target.value);
          setRegistrationDateTouched(true);
        }}
      />
      </label>


    </div>


    </div>

    {/* Outside the date row on purpose. Inside it, these share a
        column with one date input and wrap to a 260px ribbon that
        is taller than the field it describes. */}
      {registrationDeadlineInPast ? (
      <p className="validation-error">
        This draw date is less than 5 days away.
        The automatic registration deadline has already passed.
        Please choose a valid registration deadline.
      </p>
    ) : !registrationDateValid ? (
      <p className="validation-error">
        Registration deadline must occur on or before the draw date.
      </p>
    ) : restrictionsWindow && !restrictionsWindow.usable ? (
      /* Not an error: these dates are allowed, and an organizer who
         wants a fast turnaround should get one. But the screens
         participants see promise a restriction window, so they have
         to be told it will not happen rather than finding out by
         coming back to an empty page. */
      <p className="helper-text date-note">
        {restrictionsWindow.days === 0
          ? "Drawing on the registration deadline leaves no time to set restrictions, so this exchange won't use them."
          : "With one day between the deadline and the draw, there's no time to set restrictions: people are told restrictions have opened on the morning of the draw itself. This exchange won't use them."}{" "}
        Move the draw date back by a day or two to turn restrictions on.
      </p>
    ) : restrictionsWindow && restrictionsWindow.tight ? (
      <p className="helper-text date-note">
        This leaves {restrictionsWindow.days} days to set restrictions. That works,
        but anybody who doesn't read their email most days will miss
        the window. Four days or more is comfortable.
      </p>
    ) : null}

      <h3>Gift Budget</h3>

    <div className="budget-row">

    <select
      value={currency}
      onChange={(e) =>
        setCurrency(e.target.value)
      }
      disabled={noGiftLimit}
    >

        <option value="USD">USD ($)</option>
        <option value="CAD">CAD ($)</option>
        <option value="GBP">GBP (£)</option>
        <option value="EUR">EUR (€)</option>
        <option value="AUD">AUD ($)</option>
        <option value="BRL">BRL (R$)</option>
      </select>

      <input
        type="number"
        placeholder="25"
        value={giftBudget}
        onChange={(e) =>
          setGiftBudget(e.target.value)
        }
        disabled={noGiftLimit}
      />

      <label className="checkbox-inline">
        <input
          type="checkbox"
          checked={noGiftLimit}
          onChange={(e) =>
            setNoGiftLimit(e.target.checked)
          }
        />
        No Gift Limit
      </label>

    </div>


      <hr />

      <h3>Reminders</h3>

      <p className="helper-text">
        Reminder emails go out 3 days before the date you choose.
      </p>

      <label className="checkbox-inline">
        <input
          type="checkbox"
          checked={remindBeforeRegistrationDeadline}
          onChange={(e) =>
            setRemindBeforeRegistrationDeadline(e.target.checked)
          }
        />
        Remind invitees before the registration deadline
      </label>

      <label className="checkbox-inline">
        <input
          type="checkbox"
          checked={remindBeforeDrawDate}
          onChange={(e) =>
            setRemindBeforeDrawDate(e.target.checked)
          }
        />
        Remind participants before the draw date
      </label>

      <p className="helper-text">
        Leave both unchecked to send no reminders.
      </p>

      <hr />

      <h3>Organizer</h3>

      <p className="helper-text">
        Used to contact you about this exchange, and to enter you in the
        draw if you're taking part.
      </p>

      <div className="organizer-fields">
        <label>
          Your Name {includeOrganizer ? "*" : ""}
          <input
            type="text"
            placeholder="Your name"
            value={organizerName}
            onChange={(e) => {
              setOrganizerTouched(true);
              setOrganizerName(e.target.value);
            }}
          />
          {showOrganizerErrors && organizerNameMissing && (
            <span className="validation-error">
              Required because you're in the exchange.
            </span>
          )}
        </label>

        <label>
          Your Email {includeOrganizer ? "*" : ""}
          <input
            type="email"
            placeholder="you@example.com"
            value={organizerEmail}
            onChange={(e) => {
              setOrganizerTouched(true);
              setOrganizerEmail(e.target.value);
            }}
          />
          {showOrganizerErrors && organizerEmailMissing ? (
            <span className="validation-error">
              Required: this is where your assignment is sent.
            </span>
          ) : showOrganizerErrors && organizerEmailInvalid ? (
            <span className="validation-error">
              Please enter a valid email address.
            </span>
          ) : null}
        </label>
      </div>

      <label className="checkbox-inline">
        <input
          type="checkbox"
          checked={includeOrganizer}
          onChange={(e) => setIncludeOrganizer(e.target.checked)}
        />
        Include me in this gift exchange
      </label>

      <p className="helper-text">
        {includeOrganizer
          ? organizerName.trim()
            ? "You're in the draw and may be assigned someone to buy for."
            : "Enter your name above to be added to the participant list."
          : "You're organizing only, and won't be assigned anyone."}
      </p>

      {!formValid && (
        <p className="validation-error">
          {!organizerDetailsValid
            ? "Add your name and email above, or untick \u201CInclude me in this gift exchange\u201D."
            : "Fill in the required details above to continue."}
        </p>
      )}

      <div className="wizard-navigation">

        <button
      type="button"
      className="continue-button"
      onClick={() => setCurrentStep(2)}
      disabled={!formValid}
    >
      Continue →
    </button>
    </div>
      </div>

    <div className="settings-right">

      <img
        src="/images/pigeon-messenger.png"
        alt="A carrier pigeon delivering a sealed envelope"
        className="settings-logo"
      />

    </div>

    </div>
    </div>
    </>
  );
}
