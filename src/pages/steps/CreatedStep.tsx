import { useState } from "react";
import OpenJoinSetting from "./OpenJoinSetting";
import SendInvitations from "./SendInvitations";
import { useExchangeContext } from "../../exchange/context";

/** Step 3: confirmation and the registration link. */
export default function CreatedStep() {
  const {
    eventName,
    copied,
    setCurrentStep,
    copyLink,
    registrationLink,
    managementLink,
  } = useExchangeContext();

  const [managementCopied, setManagementCopied] = useState(false);

  return (
    <>
      <div className="wizard-header">
        <h1>Start a Gift Exchange</h1>
        <p>Step 3 of 3</p>
      </div>

    <div className="wizard-card">

      <h2>✅ Gift Exchange Created</h2>

      <p className="step-description">
      Your gift exchange is ready.
    </p>

    <p className="step-description next-step-text">
      Next, invite the people on your list.
    </p>


      <hr />

      <div className="exchange-title-section">
      <h3>{eventName || "Unnamed Gift Exchange"}</h3>
    </div>

      <SendInvitations />

      <hr />

      <h3>Registration Link</h3>

      <div className="link-row">

      <div className="signup-link">
      {registrationLink}
    </div>
        <button
          type="button"
          className="secondary-button"
          onClick={copyLink}
        >
          {copied ? "✓ Copied!" : "Copy Link"}
        </button>
        <OpenJoinSetting />
    </div>

    <hr />

    {managementLink && (
      <div className="management-link">
        <h3>Your way back in</h3>

        <p>
          This link opens this exchange on any device, and it's the
          only thing that does. Save it somewhere you'll find it
          again. It isn't emailed to you.
        </p>

        <div className="management-link-row">
          <code>{managementLink}</code>

          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              void navigator.clipboard?.writeText(managementLink);
              setManagementCopied(true);
              setTimeout(() => setManagementCopied(false), 2000);
            }}
          >
            {managementCopied ? "\u2713 Copied!" : "Copy"}
          </button>
        </div>

        <p className="helper-text">
          Treat it like a password: whoever opens it can manage this
          exchange, rename it, remove people, and change the dates.
          They still can't see who drew whom, because nobody can.
        </p>
      </div>
    )}

    <div className="tips-panel">
      <div className="tips-text">
    <h3>Tips for a Successful Gift Exchange</h3>

    <div className="tips-grid">

    <div className="tip-item">
    🎁 Stay within the agreed exchange budget.
    </div>

    <div className="tip-item">
    📝 Complete wishlists before the draw.
    </div>

    <div className="tip-item">
    🎯 Use interests and preferences to choose thoughtful gifts.
    </div>

    <div className="tip-item">
    🎲 Decide whether this is a traditional exchange or a Yankee Swap event.
    </div>

    <div className="tip-item">
    ⏳ Give participants enough shopping time after the draw date.
    </div>

    <div className="tip-item">
    🎉 Most importantly... have fun!
    </div>

    </div>
      </div>

      {/* Decorative, so no alt text: it says nothing the tips do
          not. Hidden on a narrow screen, where it would push the
          buttons below the fold to no purpose. */}
      <img
        className="tips-art"
        src="/images/pigeon-messenger.png"
        alt=""
        width={700}
        height={581}
      />
  

      </div>

      <div className="wizard-navigation">

      <button
        type="button"
        className="back-button"
        onClick={() => setCurrentStep(1)}
      >
        ← Edit Exchange
      </button>

      <button
        type="button"
        className="continue-button"
        onClick={() => setCurrentStep(4)}
      >
        Invite Participants →
      </button>

    </div>

    </div>
    </>
  );
}
