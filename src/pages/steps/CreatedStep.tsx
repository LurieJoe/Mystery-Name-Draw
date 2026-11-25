import { useExchangeContext } from "../../exchange/context";

/** Step 3: confirmation and the registration link. */
export default function CreatedStep() {
  const {
    eventName,
    copied,
    setCurrentStep,
    copyLink,
    registrationLink,
    allowOpenJoin,
    changeOpenJoin,
  } = useExchangeContext();

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
      Next, invite participants to register using the link below.
    </p>


      <hr />

      <div className="exchange-title-section">
      <h3>{eventName || "Unnamed Gift Exchange"}</h3>
    </div>

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
        <div className="invite-setting">

        <label className="checkbox-inline">
      <input
        type="checkbox"
        checked={allowOpenJoin}
        onChange={(e) => void changeOpenJoin(e.target.checked)}
      />
      Allow participants to invite others
    </label>

    <p className="helper-text">
      {allowOpenJoin
        ? "Anyone with the registration link can join, so participants can pass it on."
        : "Only the people you list can join. Anyone else following the link is told it is invitation only."}
    </p>
    </div>
    </div>

    <hr />

    <hr />

    <div className="tips-panel">

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
