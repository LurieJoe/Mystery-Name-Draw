import { useState, useEffect } from "react";
import Header from "./components/Header";
import "./CreateEventPage.css";

function CreateEventPage() {
    const [participants, setParticipants] = useState<
  { name: string; email: string }[]
>([]);
const [theme, setTheme] = useState(
    localStorage.getItem("theme") || "dark"
  );
const [newName, setNewName] = useState("");
const [newEmail, setNewEmail] = useState("");
const [copied, setCopied] = useState(false);
const [currentStep, setCurrentStep] = useState(1);
const [exchangeCreated, setExchangeCreated] = useState(false);
const [currency, setCurrency] = useState("USD");
const [registrationDateTouched,
  setRegistrationDateTouched] =
  useState(false);
const [registrationDeadline, setRegistrationDeadline] =
  useState("");

const [drawDate, setDrawDate] =
  useState("");

const [giftBudget, setGiftBudget] =
  useState("");

const [noGiftLimit, setNoGiftLimit] =
  useState(false);

const [reminderPreference, setReminderPreference] =
  useState("both");
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
  const copyLink = async () => {
    await navigator.clipboard.writeText(
      "https://mysterynamedraw.com/join/example"
    );
  
    setCopied(true);
  
    setTimeout(() => {
      setCopied(false);
    }, 2000);
  };
  const formatDate = (dateString: string) => {
    if (!dateString) return "Not set";
  
    return new Date(dateString).toLocaleDateString();
  };
  useEffect(() => {
    document.documentElement.setAttribute(
      "data-theme",
      theme
    );
  }, [theme]);
  useEffect(() => {
    localStorage.setItem("theme", theme);
  }, [theme]);
  const registrationDateValid =
  !registrationDeadline ||
  !drawDate ||
  registrationDeadline <= drawDate;
  return (
    <>
      <Header
  theme={theme}
  setTheme={setTheme}
/>

      <div className="create-event-page">
      {currentStep === 1 && (
        <>
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
  onClick={copyLink}
>
  {copied ? "✓ Copied!" : "Copy Link"}
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
  onClick={() => setCurrentStep(2)}
>
  Continue →
</button>

  </div>

</div>
</>
)}
{currentStep === 2 && (

<div className="wizard-card">

  <h2>Gift Exchange Settings</h2>

  <p className="step-description">
    Configure important details for your gift exchange.
  </p>
  <div className="settings-layout">

  <div className="settings-left">

<div className="date-row">

  <div className="date-field">

<label>
  Name Draw Date
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
  Registration Deadline

  <input
    type="date"
    value={registrationDeadline}
    onChange={(e) => {
      setRegistrationDeadline(e.target.value);
      setRegistrationDateTouched(true);
    }}
  />
  </label>

  {!registrationDateValid && (
    <p className="validation-error">
      Registration deadline must occur or before the draw date.
    </p>
  )}

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

  <label className="radio-option">
  <input
  type="radio"
  name="reminders"
  checked={reminderPreference === "both"}
  onChange={() => setReminderPreference("both")}
/>
    Send both reminders (Recommended)
  </label>

  <label className="radio-option">
  <input
  type="radio"
  name="reminders"
  checked={reminderPreference === "registration"}
  onChange={() => setReminderPreference("registration")}
/>
    Registration deadline only
  </label>

  <label className="radio-option">
  <input
  type="radio"
  name="reminders"
  checked={reminderPreference === "draw"}
  onChange={() => setReminderPreference("draw")}
/>
    Name draw date only
  </label>

  <label className="radio-option">
  <input
  type="radio"
  name="reminders"
  checked={reminderPreference === "none"}
  onChange={() => setReminderPreference("none")}
/>

    Do not send reminders
  </label>

  <div className="wizard-navigation">



    <button
      type="button"
      className="back-button"
      onClick={() => setCurrentStep(1)}
    >
      ← Back
    </button>

    <button
  type="button"
  className="continue-button"
  onClick={() => setCurrentStep(3)}
  disabled={!registrationDateValid}
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

)}

{currentStep === 3 && (

<div className="wizard-card">

  <h2>Review & Create</h2>

  <div className="review-layout">

<div className="review-grid">

  <div className="review-card">
    <div className="review-label">
      Participants
    </div>

    <div className="review-value">
      {participants.length}
    </div>
  </div>

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
      Registration Deadline
    </div>

    <div className="review-value">
      {formatDate(registrationDeadline)}
    </div>
  </div>

  <div className="review-card">
    <div className="review-label">
      Currency
    </div>

    <div className="review-value">
      {currency}
    </div>
  </div>

  <div className="review-card">
    <div className="review-label">
      Budget
    </div>

    <div className="review-value">
      {noGiftLimit
        ? "No Limit"
        : `$${giftBudget}`}
    </div>
  </div>

  <div className="review-card">
    <div className="review-label">
      Send Reminders
    </div>

    <div className="review-value">
    {
  reminderPreference === "both"
    ? "Registration Deadline & Draw Date"
    : reminderPreference === "registration"
    ? "Registration Deadline"
    : reminderPreference === "draw"
    ? "Draw Date"
    : "Do not send reminders"
}
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
      onClick={() => setCurrentStep(2)}
    >
      ← Edit Gift Exchange Details
    </button>

    <button
  type="button"
  className="continue-button"
  onClick={() => {
    setExchangeCreated(true);
    setCurrentStep(4);
  }}
>
  Create Gift Exchange
</button>

  </div>

</div>

)}
{currentStep === 4 && (

<div className="wizard-card">

  <h2>✅ Gift Exchange Created</h2>

  <p className="step-description">
    Your gift exchange is ready. Share the registration link below and invite participants.
  </p>

  <div className="review-layout">

    <div className="review-grid">

      <div className="review-card">
        <div className="review-label">
          Participants
        </div>

        <div className="review-value">
          {participants.length}
        </div>
      </div>

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
          Registration Deadline
        </div>

        <div className="review-value">
          {formatDate(registrationDeadline)}
        </div>
      </div>

      <div className="review-card">
        <div className="review-label">
          Currency
        </div>

        <div className="review-value">
          {currency}
        </div>
      </div>

      <div className="review-card">
        <div className="review-label">
          Budget
        </div>

        <div className="review-value">
          {noGiftLimit
            ? "No Limit"
            : `$${giftBudget}`}
        </div>
      </div>

      <div className="review-card">
        <div className="review-label">
          Reminders
        </div>

        <div className="review-value">
          {
            reminderPreference === "both"
              ? "Registration & Draw Date"
              : reminderPreference === "registration"
              ? "Registration Only"
              : reminderPreference === "draw"
              ? "Draw Date Only"
              : "None"
          }
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

  <hr />

  <h3>Registration Link</h3>

  <div className="link-row">

    <div className="signup-link">
      https://mysterynamedraw.com/join/example
    </div>

    <button
      type="button"
      className="secondary-button"
      onClick={copyLink}
    >
      {copied ? "✓ Copied!" : "Copy Link"}
    </button>

  </div>

  <div className="wizard-navigation">

    <button
      type="button"
      className="back-button"
      onClick={() => {
        setExchangeCreated(false);
        setCurrentStep(3);
      }}
    >
      ← Edit Exchange
    </button>

    <button
      type="button"
      className="continue-button"
    >
      Send Invitations →
    </button>

  </div>

</div>

)}

      </div>
    </>
  );
}

export default CreateEventPage;