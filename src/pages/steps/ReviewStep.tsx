import { useExchangeContext } from "../../exchange/context";

/** Step 2: review everything before the exchange is created. */
export default function ReviewStep() {
  const {
    eventName,
    setCurrentStep,
    eventCode,
    setEventCode,
    includeOrganizer,
    emailSubject,
    setEmailSubject,
    registrationDeadline,
    drawDate,
    formatDate,
    organizerParticipant,
    generateEventCode,
    giftBudgetLabel,
    reminderSummary,
  } = useExchangeContext();

  return (
    <>
      <div className="wizard-header">
        <h1>Start a Gift Exchange</h1>
        <p>Step 2 of 3</p>
      </div>

    <div className="wizard-card">

      <h2>Review & Create</h2>
      <div className="exchange-title-section">
      <h3>{eventName || "Unnamed Gift Exchange"}</h3>
    </div>

      <div className="review-layout">

    <div className="review-grid">

      <div className="review-card">
        <div className="review-label">
          Draw Date
        </div>

        <div className="review-value">
          {formatDate(drawDate)}
        </div>
      </div>

      <div className="review-card">
        <div className="review-label">
          Budget
        </div>

        <div className="review-value">
          {giftBudgetLabel}
        </div>
      </div>
  
      <div className="review-card">
        <div className="review-label">
          Registration Deadline
        </div>

        <div className="review-value">
          {formatDate(registrationDeadline)}
        </div>
      </div>

      <div className="review-card">
        <div className="review-label">
          Send Reminders
        </div>

        <div className="review-value">
          {reminderSummary}
        </div>
      </div>

      <div className="review-card">
        <div className="review-label">
          You Are Participating
        </div>

        <div className="review-value">
          {organizerParticipant
            ? `Yes, as ${organizerParticipant.name}`
            : includeOrganizer
            ? "Yes - add your name in Settings"
            : "No, organizing only"}
        </div>
      </div>

    </div>

    <div className="review-logo">
      <img
        src="/images/logo-primary-v1.png"
        alt="Mystery Name Draw"
        className="participant-logo"
      />
    </div>

    </div>

      <div className="wizard-navigation">

        <button
          type="button"
          className="back-button"
          onClick={() => setCurrentStep(1)}
        >
          ← Edit Settings
        </button>

        <button
      type="button"
      className="continue-button"
      onClick={() => {
        if (!eventCode) {
          setEventCode(generateEventCode());
        }

        if (!emailSubject.trim()) {
          setEmailSubject(
            `You're Invited to Join ${eventName || "This Gift Exchange"}`
          );
        }
        setCurrentStep(3);
      }}
    >
      Create Gift Exchange
    </button>

      </div>

    </div>
    </>
  );
}
