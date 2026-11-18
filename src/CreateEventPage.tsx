import Header from "./components/Header";
import "./CreateEventPage.css";

function CreateEventPage() {
  return (
    <>
      <Header />

      <div className="create-event-page">
        <div className="wizard-header">
          <h1>Start a Gift Exchange</h1>

          <p>Step 1 of 3</p>
        </div>

        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: "33.33%" }}
          ></div>
        </div>

        <div className="wizard-card">

  <h2>Invite Participants</h2>

  <p className="step-description">
    Add people you'd like to invite to your gift exchange.
  </p>

  <div className="participants-layout">

    <div className="participants-left">

      <div className="participant-entry">

        <input
          type="text"
          placeholder="Participant Name"
        />

        <input
          type="email"
          placeholder="Email Address"
        />

        <button
          type="button"
          className="secondary-button"
        >
          + Add Participant
        </button>

      </div>

      <div className="participants-table">

      <h3>Participants</h3>

<p className="participant-note">
  Every participant added here is entered into the gift exchange.
</p>

<div className="participant-table-header">
  <span>Name</span>
  <span className="email-header">
    Email Address
  </span>
  <span></span>
</div>
<div className="participant-placeholder-row">
  <div className="placeholder-line"></div>
  <div className="placeholder-line"></div>
</div>

<div className="participant-placeholder-row">
  <div className="placeholder-line"></div>
  <div className="placeholder-line"></div>
</div>

<div className="participant-placeholder-row">
  <div className="placeholder-line"></div>
  <div className="placeholder-line"></div>
</div>

      </div>

    </div>

    <div className="participants-right">

      <img
        src="/images/logo-primary-v1.png"
        alt="Mystery Name Draw"
        className="participant-logo"
      />


    </div>

  </div>

  <hr />

  <h3>Shareable Sign-Up Link</h3>

  <p className="helper-text">
    Share this link with anyone else you'd like to invite to join your gift exchange via messaging or social media.
  </p>

  <div className="link-row">
  <div className="signup-link">
    https://mysterynamedraw.com/join/example
  </div>

  <button
    type="button"
    className="secondary-button"
  >
    Copy Link
  </button>

  </div>

  <hr />
  <div className="invite-setting">
  <label className="checkbox-inline">
    <input
      type="checkbox"
      defaultChecked
    />
    <span>Allow participants to invite others</span>
  </label>

  <p className="helper-text">
    Participants may share the sign-up link and invite
    additional people to join the exchange.
  </p>
</div>


  <div className="wizard-navigation">

    <button
      type="button"
      className="back-button"
    >
      ← Back
    </button>

    <button
      type="button"
      className="continue-button"
    >
      Continue →
    </button>

  </div>

</div>

      </div>
    </>
  );
}

export default CreateEventPage;