import { useState } from "react";
import { useExchangeContext } from "../../exchange/context";

/** Step 5: registration status, event code, and templates. */
export default function ManageStep() {
  const {
    eventName,
    setCurrentStep,
    setEventCode,
    registrationOpen,
    setRegistrationOpen,
    generateEventCode,
    exportExchange,
    managementLink,
  } = useExchangeContext();

  const [linkCopied, setLinkCopied] = useState(false);

  return (
      <div className="wizard-card">

        <div className="exchange-title-section">
          <h3>{eventName}</h3>
        </div>

        <h2>Manage Exchange</h2>

        <p className="step-description">
        Manage participant restrictions, registration settings, and draw options for this exchange.
        </p>
        <h3>Event Management</h3>

    <div className="event-management">

    <p
      className={`registration-status ${
        registrationOpen ? "open" : "closed"
      }`}
    >
      Registration:
      <strong>
        {registrationOpen ? " Open" : " Closed"}
      </strong>
    </p>

    <div className="event-management-actions">
      <br /><br />

      <button
      type="button"
      className="secondary-button"
      onClick={() => setCurrentStep(1)}
    >
      Edit Exchange
    </button>

      <button
        type="button"
        className="secondary-button"
        onClick={() => {
          if (registrationOpen) {
            const confirmed = window.confirm(
              "Close registration?\n\nNew participants will no longer be able to join this event."
            );

            if (confirmed) {
              setRegistrationOpen(false);
            }
          } else {
            setRegistrationOpen(true);
          }
        }}
      >
        {registrationOpen
          ? "Close Registration"
          : "Reopen Registration"}
      </button>

      <button
        type="button"
        className="secondary-button"
        onClick={() => {
          const confirmed = window.confirm(
            "Generate a new event code?\n\nExisting invitation emails, text messages, and registration links will stop working immediately."
          );

          if (confirmed) {
            setEventCode(generateEventCode());
          }
        }}
      >
        Generate New Code
      </button>

      <button
        type="button"
        className="secondary-button"
        onClick={exportExchange}
      >
        Save as Template
      </button>

      {managementLink && (
        <button
          type="button"
          className="secondary-button"
          onClick={() => {
            void navigator.clipboard?.writeText(managementLink);
            setLinkCopied(true);
            setTimeout(() => setLinkCopied(false), 2000);
          }}
        >
          {linkCopied ? "\u2713 Copied!" : "Copy Management Link"}
        </button>
      )}
    </div>
    </div>

        <div className="wizard-navigation">

          <button
            type="button"
            className="back-button"
            onClick={() => setCurrentStep(4)}
          >
            ← Back
          </button>

          <button
            type="button"
            className="continue-button"
            onClick={() => setCurrentStep(6)}
          >
            Draw Validation →
          </button>

        </div>

      </div>
  );
}
