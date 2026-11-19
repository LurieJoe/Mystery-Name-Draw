import { useState, useEffect } from "react";
import Header from "./components/Header";
import "./CreateEventPage.css";

function CreateEventPage() {
    const [participants, setParticipants] = useState<
  { name: string; email: string }[]
>([]);
const [theme, setTheme] = useState("dark");
const [newName, setNewName] = useState("");
const [newEmail, setNewEmail] = useState("");
const addParticipant = () => {
    if (!newName.trim() || !newEmail.trim()) {
      return;
    }
  
    const emailRegex =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
    if (!emailRegex.test(newEmail.trim())) {
      alert("Please enter a valid email address.");
      return;
    }
  
    setParticipants([
      ...participants,
      {
        name: newName.trim(),
        email: newEmail.trim(),
      },
    ]);
  
    setNewName("");
    setNewEmail("");
  };
  const editParticipant = (index: number) => {
    const participant = participants[index];
  
    setNewName(participant.name);
    setNewEmail(participant.email);
  
    setParticipants(
      participants.filter((_, i) => i !== index)
    );
  };
  useEffect(() => {
    document.documentElement.setAttribute(
      "data-theme",
      theme
    );
  }, [theme]);
  return (
    <>
      <Header
  theme={theme}
  setTheme={setTheme}
/>

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
    Every participant added here is entered into the gift exchange upon registration.

  </p>

  <div className="participants-layout">

    <div className="participants-left">

      <div className="participants-table">

<div className="participant-table-header">
  <span>Name</span>
  <span className="email-header">
    Email Address
  </span>
  <span></span>
</div>
<div className="participant-entry-row">

<input
  type="text"
  placeholder="Participant Name"
  value={newName}
  onChange={(e) => setNewName(e.target.value)}
/>

<input
  type="email"
  placeholder="Email Address"
  value={newEmail}
  onChange={(e) => setNewEmail(e.target.value)}
/>

<button
  type="button"
  className="clear-row-button"
  title="Clear entry"
  onClick={() => {
    setNewName("");
    setNewEmail("");
  }}
>
  x
</button>

<button
  type="button"
  className="add-row-button"
  title="Add participant"
  onClick={addParticipant}
>
  +
</button>


</div>
{participants.map((participant, index) => (
  <div
    key={index}
    className="participant-row"
  >
    <span>{participant.name}</span>

    <span>{participant.email}</span>

    <div className="participant-actions">

      <button
        type="button"
        title="Edit participant's name or email address"
        onClick={() => editParticipant(index)}
      >
        ✏️
      </button>

      <button
        type="button"
        title="Remove participant"
        onClick={() =>
          setParticipants(
            participants.filter((_, i) => i !== index)
          )
        }
      >
        ×
      </button>

    </div>

  </div>
))}

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