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
    {/* Split, because this list mixed two jobs. Half of it was
        advice the organizer can act on; the other half was advice
        for people who were never going to see this screen. Those
        now reach them where they can act on them: on their own page
        when they register, and again when the draw hands them a
        name. */}
    <h3>Yours to decide</h3>

    <div className="tips-grid">

    <div className="tip-item">
    🎲 Whether this is a traditional exchange or a Yankee Swap.
    </div>

    <div className="tip-item">
    🎁 A budget everyone's comfortable with, said out loud.
    </div>

    <div className="tip-item">
    ⏳ Enough shopping time between the draw and the day itself.
    </div>

    <div className="tip-item">
    📝 A nudge to anyone who hasn't written a wishlist before the draw.
    </div>

    </div>

    <h3>What everyone else is told</h3>

    <p className="helper-text">
      You don't have to pass these on. Each person sees them on their
      own page: the first when they register, the rest when the draw
      gives them a name.
    </p>

    <div className="tips-grid">

    <div className="tip-item">
    📝 Write a wishlist with enough detail to shop from.
    </div>

    <div className="tip-item">
    🎯 Read their wishlist and what they'd rather not receive.
    </div>

    <div className="tip-item">
    🎁 Stay within the budget.
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
