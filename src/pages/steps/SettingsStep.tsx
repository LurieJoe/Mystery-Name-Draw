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
  } = useExchangeContext();

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
    ) : null}

    </div>


    </div>

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
        draw if you are taking part.
      </p>

      <div className="organizer-fields">
        <label>
          Your Name
          <input
            type="text"
            placeholder="Your name"
            value={organizerName}
            onChange={(e) => setOrganizerName(e.target.value)}
          />
        </label>

        <label>
          Your Email
          <input
            type="email"
            placeholder="you@example.com"
            value={organizerEmail}
            onChange={(e) => setOrganizerEmail(e.target.value)}
          />
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
            ? "You are in the draw and may be assigned someone to buy for."
            : "Enter your name above to be added to the participant list."
          : "You are organizing only, and will not be assigned anyone."}
      </p>

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
        src="/images/logo-primary-v1.png"
        alt="Mystery Name Draw"
        className="settings-logo"
      />

    </div>

    </div>
    </div>
    </>
  );
}
