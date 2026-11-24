import { useState, useEffect, useRef } from "react";
import Header from "./components/Header";
import "./CreateEventPage.css";

function CreateEventPage() {
const [theme, setTheme] = useState(
    localStorage.getItem("theme") || "dark"
  );
  const [eventName, setEventName] = useState("");
const [copied, setCopied] = useState(false);
const [currentStep, setCurrentStep] = useState(1);
const [currency, setCurrency] = useState("USD");
const [eventCode, setEventCode] = useState("");
const [registrationOpen, setRegistrationOpen] = useState(true);
const [includeOrganizer, setIncludeOrganizer] =
  useState(true);
const [emailSubject, setEmailSubject] = useState("");
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
  useState("draw");
  const participantNameRef =
  useRef<HTMLInputElement>(null);
  const copyLink = async () => {
    await navigator.clipboard.writeText(
      `https://mysterynamedraw.com/event/${eventCode}`
    );
  
    setCopied(true);
  
    setTimeout(() => {
      setCopied(false);
    }, 2000);
  };
  const formatDate = (dateString: string) => {
    if (!dateString) return "Not set";
  
    const [year, month, day] =
      dateString.split("-").map(Number);
  
    return new Date(
      year,
      month - 1,
      day
    ).toLocaleDateString();
  };
  const [invitees, setInvitees] = useState<
  {
    name: string;
    email: string;
    status: string;
    restrictions: string[];
  }[]
>([]);

const [inviteName, setInviteName] = useState("");
const [inviteEmail, setInviteEmail] = useState("");
  useEffect(() => {
    document.documentElement.setAttribute(
      "data-theme",
      theme
    );
  }, [theme]);
  useEffect(() => {
    localStorage.setItem("theme", theme);
  }, [theme]);
  const [editingInviteeIndex, setEditingInviteeIndex] =
  useState<number | null>(null);
  const [restrictionEditorIndex, setRestrictionEditorIndex] =
  useState<number | null>(null);
  const [showAllRestrictions, setShowAllRestrictions] =
  useState(false);
  const registrationDateValid =
  !registrationDeadline ||
  !drawDate ||
  registrationDeadline <= drawDate;
  
  const today = new Date()
  .toISOString()
  .split("T")[0];


  const registrationDeadlineInPast =
  !!registrationDeadline &&
  registrationDeadline < today;

  const formValid =
  eventName.trim() &&
  drawDate &&
  registrationDeadline &&
  registrationDateValid &&
  !registrationDeadlineInPast;
 
  const generateEventCode = () => {
    const chars =
      "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  
    let code = "";
  
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(
        Math.floor(Math.random() * chars.length)
      );
    }
  
    return code;
  };
  const resetExchange = () => {
    setEventName("");
    setDrawDate("");
    setRegistrationDeadline("");
    setRegistrationDateTouched(false);
    setGiftBudget("");
    setCurrency("USD");
    setNoGiftLimit(false);
    setReminderPreference("draw");

    setEventCode("");
    setCopied(false);
    setRegistrationOpen(true);

    setInvitees([]);
    setInviteName("");
    setInviteEmail("");
    setEditingInviteeIndex(null);
    setRestrictionEditorIndex(null);
    setShowAllRestrictions(false);
    setIncludeOrganizer(true);
    setEmailSubject("");

    setCurrentStep(1);
  };
  const invitationMessage = `Hello,

You've been invited to participate in ${eventName}.

Registration Deadline:
${formatDate(registrationDeadline)}

Draw Date:
${formatDate(drawDate)}

Register here for the gift exchange:

https://mysterynamedraw.com/event/${eventCode}

We Hope you'll join us!
`;
const addInvitee = () => {
  if (!inviteName.trim() || !inviteEmail.trim()) {
    return;
  }
  const emailRegex =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

if (!emailRegex.test(inviteEmail.trim())) {
  alert("Please enter a valid email address.");
  return;
}
  const updatedInvitee = {
    name: inviteName.trim(),
    email: inviteEmail.trim(),
    status: "Invite Pending",
    restrictions: [],
  };

  if (editingInviteeIndex !== null) {
    const updatedInvitees = [...invitees];

    updatedInvitees[editingInviteeIndex] =
      updatedInvitee;

    setInvitees(updatedInvitees);

    setEditingInviteeIndex(null);
  } else {
    setInvitees([
      ...invitees,
      updatedInvitee,
    ]);
  }

  setInviteName("");
  setInviteEmail("");

  participantNameRef.current?.focus();
};  
return (
    <>
      <Header
  theme={theme}
  setTheme={setTheme}
  onStartExchange={() => {

    const hasExchangeData =
      eventName.trim() ||
      drawDate ||
      registrationDeadline ||
      giftBudget ||
      eventCode ||
      invitees.length > 0;

    if (hasExchangeData) {

      const confirmed = window.confirm(
        "Start a new gift exchange?\n\n" +
        "This will clear the current gift exchange and all unsaved changes."
      );

      if (!confirmed) {
        return;
      }
    }

    resetExchange();
  }}
/>

      <div className="create-event-page">
{currentStep === 1 && (
<>
  <div className="wizard-header">
    <h1>Start a Gift Exchange</h1>
    <p>Step 1 of 3</p>
  </div>

  <div className="wizard-card">


  <h2>Gift Exchange Settings</h2>

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
  Registered participants will receive a reminder
  3 days before the draw date.
</p>

  <label className="radio-option">
  <input
  type="radio"
  name="reminders"
  checked={reminderPreference === "draw"}
  onChange={() => setReminderPreference("draw")}
/>
    Draw date approaching (Recommended)
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
)}

{currentStep === 2 && (

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
      {noGiftLimit
        ? "No Limit"
        : `${currency} $${giftBudget}`}
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
    {
  reminderPreference === "draw"

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

)}
{currentStep === 3 && (

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
  {`https://mysterynamedraw.com/event/${eventCode}`}
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
    defaultChecked
  />
  Allow participants to invite others
</label>

<p className="helper-text">
  Participants may share the registration link and invite additional people to join the exchange.
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

)}

{currentStep === 4 && (

<div className="wizard-card">

<div className="exchange-title-section">
  <h3>{eventName || "Unnamed Gift Exchange"}</h3>
</div>

 <h3>Share your event link and track participant registrations.</h3>


 <h3>Invitation List</h3>
 
<div className="invitee-entry-row">

  <input
    ref={participantNameRef}
    type="text"
    placeholder="Participant Name"
    value={inviteName}
    onChange={(e) =>
      setInviteName(e.target.value)
    }
  />

  <input
    type="email"
    placeholder="Email Address"
    value={inviteEmail}
    onChange={(e) =>
      setInviteEmail(e.target.value)
    }
  />

  <button
    type="button"
    className="secondary-button"
    onClick={addInvitee}
  >
    {
  editingInviteeIndex !== null
    ? "Save Changes"
    : "Add Participant"
}
  </button>

</div>

<div className="invitee-header">
  <span>Name</span>
  <span>Email Address</span>
  <span>Actions</span>
  <span>Status</span>
  <span>Restrictions</span>
</div>

<div className="invitee-list">

  {invitees.map((invitee, index) => (
    <div
      key={index}
      className="invitee-row"
    >
      <span>{invitee.name}</span>
      <span>{invitee.email}</span>

      <div className="invitee-actions">

  <button
    type="button"
    className="secondary-button"
    onClick={() => {
      setInviteName(invitee.name);
      setInviteEmail(invitee.email);
      setEditingInviteeIndex(index);
    }}
  >
    Edit
  </button>

  <button
    type="button"
    className="secondary-button remove-button"
    onClick={() =>
      setInvitees(
        invitees.filter(
          (_, i) => i !== index
        )
      )
    }
  >
    Remove
  </button>

</div>

<span className="invitee-status">
  {invitee.status === "Invited"
    ? "📧 Invited"
    : "⚪ Invite Pending"}
</span>
<div className="invitee-restrictions">

<button
  type="button"
  className="secondary-button"
  onClick={() => {
    setRestrictionEditorIndex(index);

    setTimeout(() => {
      document
        .getElementById("restriction-editor")
        ?.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
    }, 100);
  }}
>
  Manage ({invitee.restrictions.length})
</button>


</div>

    </div>
  ))}
{restrictionEditorIndex !== null && (
  <div
    id="restriction-editor"
    className="restriction-editor"
  >
    <h3>
      Restrictions for{" "}
      {invitees[restrictionEditorIndex].name}
    </h3>
    <button
  type="button"
  className="secondary-button"
  onClick={() => setRestrictionEditorIndex(null)}
>
  Hide Restrictions
</button>
    {invitees
  .filter(
    (_, i) => i !== restrictionEditorIndex
  )
  .map((participant, i) => (
    <label
      key={i}
      className="checkbox-inline"
    >
      <input
        type="checkbox"
        checked={
          invitees[
            restrictionEditorIndex
          ].restrictions.includes(
            participant.name
          )
        }
        onChange={(e) => {
          const isChecked = e.target.checked;

          setInvitees((previousInvitees) =>
            previousInvitees.map((item, itemIndex) =>
              itemIndex === restrictionEditorIndex
                ? {
                    ...item,
                    restrictions: isChecked
                      ? Array.from(
                          new Set([
                            ...item.restrictions,
                            participant.name,
                          ])
                        )
                      : item.restrictions.filter(
                          (restriction) =>
                            restriction !== participant.name
                        ),
                  }
                : item
            )
          );
        }}
      />

      {participant.name}
    </label>
  ))}  </div>
)}

</div>

<h3>Restrictions</h3>

<button
  type="button"
  className="secondary-button"
  onClick={() =>
    setShowAllRestrictions(
      !showAllRestrictions
    )
  }
>
{showAllRestrictions
  ? "Hide All Restrictions"
  : "View All Restrictions"}
</button>
{showAllRestrictions && (
  <div className="restriction-editor">

    <h3>All Restrictions</h3>

    {invitees.map((invitee, index) => (
      <div key={index}>

        <strong>{invitee.name}</strong>

        {invitee.restrictions.length > 0 ? (
          <ul>
            {invitee.restrictions.map(
              (restriction, i) => (
                <li key={i}>
                  {restriction}
                </li>
              )
            )}
          </ul>
        ) : (
          <p>No restrictions</p>
        )}

      </div>
    ))}

  </div>
)}
<h3>Participants</h3>
<label className="checkbox-inline">
<input
  type="checkbox"
  checked={includeOrganizer}
  onChange={(e) =>
    setIncludeOrganizer(e.target.checked)
  }
/>
  Include me in this gift exchange
</label>

<p className="helper-text">
  The organizer will participate in the gift exchange and may receive a recipient assignment.
</p>

<div className="created-participants">
<p>
  <strong>
    {includeOrganizer ? "1 Registered" : "0 Registered"}
  </strong>
</p>

{includeOrganizer && (
  <ul>
    <li>✅ Organizer</li>
  </ul>
)}
</div>

  <h3>Registration Link</h3>

<div className="signup-link">
  {`https://mysterynamedraw.com/event/${eventCode}`}
</div>

<div className="event-management-actions">
  <button
    type="button"
    className="secondary-button"
    onClick={copyLink}
  >
    Copy Link
  </button>

  <button
  type="button"
  className="secondary-button"
  onClick={async () => {
    await navigator.clipboard.writeText(
      `Subject: ${emailSubject}\n\n${invitationMessage}`
    );

    alert("Invitation copied to clipboard.");
  }}
>
  Copy Invitation
  </button>
  <button
  type="button"
  className="secondary-button"
  onClick={async () => {
    await navigator.clipboard.writeText(
      `Subject: ${emailSubject}\n\n${invitationMessage}`
    );
  
    alert(
      "Invitation copied to clipboard. Paste it into your email application."
    );
  }}
>
  Email Invitation
</button>

<button
  type="button"
  className="secondary-button"
  onClick={async () => {
    await navigator.clipboard.writeText(
      invitationMessage
    );

    alert(
      "Invitation copied to your clipboard. Paste it into a text message."
    );
  }}
>
  Text Invitation
</button>

</div>

  <h3>Preview Email</h3>

  <div className="email-preview-card">

  <div className="email-preview-subject">

  <label>
    <strong>Subject:</strong>

    <input
  className="email-subject-input"
  type="text"
  value={emailSubject}
  onChange={(e) =>
    setEmailSubject(e.target.value)
  }

/>
  </label>

</div>

  <hr />

  <div className="email-preview-body">
  <p>Hello,</p>

  <p>
    You've been invited to participate in{" "}
    {eventName || "this gift exchange"}.
  </p>

  <p>
    <strong>Registration Deadline:</strong>
    <br />
    {formatDate(registrationDeadline)}
  </p>

  <p>
    <strong>Draw Date:</strong>
    <br />
    {formatDate(drawDate)}
  </p>

  <p>
    Register here for the gift exchange:
  </p>

  <p>
  {`https://mysterynamedraw.com/event/${eventCode}`}
</p>
<p>
  We hope you'll join us!
</p>
</div>

</div>

  <div className="wizard-navigation created-event-navigation">

    <button
      type="button"
      className="back-button"
      onClick={() => setCurrentStep(3)}
    >
      ← Back
    </button>

    <button
      type="button"
      className="continue-button"
      onClick={() => setCurrentStep(5)}
    >
      Manage Exchange →
    </button>

  </div>

</div>

)}
{currentStep === 5 && (
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
      >
        Draw Validation →
      </button>

    </div>

  </div>
)}
      </div>
    </>
  );
}

export default CreateEventPage;