import { useState, useRef } from "react";
import type { ChangeEvent } from "react";
import Header from "./components/Header";
import "./CreateEventPage.css";

type Invitee = {
  id: string;
  name: string;
  email: string;
  status: string;
};

type RestrictionDirection = "give" | "receive";

/**
 * One restriction, belonging to the participant who set it.
 *
 * `ownerId` is whose choice this is, and it is only ever shown on that
 * person's own list. `direction` is read from the owner's point of view:
 *   "give"    -> owner must not be assigned to buy for `otherId`
 *   "receive" -> `otherId` must not be assigned to buy for owner
 *
 * Direction matters: an owner refusing to give to someone says nothing
 * about the reverse. Two roster can independently express the same
 * underlying constraint (Joe won't give to Evelyn; Evelyn won't receive
 * from Joe) - those stay two separate records, because they are two
 * people's choices. The draw collapses them when it builds the set of
 * forbidden giver/receiver pairs.
 */
type Restriction = {
  ownerId: string;
  otherId: string;
  direction: RestrictionDirection;
};

// The organizer is a participant like anyone else, with a fixed id so
// restrictions naming them survive toggling "Include me" off and on.
const ORGANIZER_ID = "organizer";

const INVITE_PENDING = "Invite Pending";
const INVITED = "Invited";
const REGISTERED = "Registered";

const INVITEE_STATUSES = [INVITE_PENDING, INVITED, REGISTERED];

/**
 * Local-calendar ISO date. `toISOString()` converts to UTC first, so
 * west of Greenwich it returns tomorrow's date all evening.
 */
const toIsoDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(date.getDate()).padStart(2, "0")}`;

/** Move an ISO date forward whole years, clamping Feb 29 to Feb 28. */
const shiftIsoDateByYears = (value: string, years: number) => {
  if (!value || years === 0) {
    return value;
  }

  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    return value;
  }

  const targetYear = year + years;
  const lastDayOfMonth = new Date(targetYear, month, 0).getDate();

  return `${targetYear}-${String(month).padStart(2, "0")}-${String(
    Math.min(day, lastDayOfMonth)
  ).padStart(2, "0")}`;
};

const createInviteeId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `invitee-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;

function CreateEventPage() {
  const [eventName, setEventName] = useState("");
const [copied, setCopied] = useState(false);
const [currentStep, setCurrentStep] = useState(1);
const [currency, setCurrency] = useState("USD");
const [eventCode, setEventCode] = useState("");
const [registrationOpen, setRegistrationOpen] = useState(true);
const [includeOrganizer, setIncludeOrganizer] =
  useState(true);
const [organizerName, setOrganizerName] = useState("");
const [organizerEmail, setOrganizerEmail] = useState("");
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

const [
  remindBeforeRegistrationDeadline,
  setRemindBeforeRegistrationDeadline,
] = useState(true);

const [remindBeforeDrawDate, setRemindBeforeDrawDate] =
  useState(true);
  const participantNameRef =
  useRef<HTMLInputElement>(null);
  const copyLink = async () => {
    await navigator.clipboard.writeText(
      registrationLink
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
  const [invitees, setInvitees] = useState<Invitee[]>([]);
  const [restrictions, setRestrictions] = useState<Restriction[]>([]);

  const organizerParticipant: Invitee | null =
    includeOrganizer && organizerName.trim()
      ? {
          id: ORGANIZER_ID,
          name: organizerName.trim(),
          email: organizerEmail.trim(),
          status: "Organizer",
        }
      : null;

  // Everyone the organizer manages: the organizer plus every invitee,
  // whatever their status.
  const roster: Invitee[] = organizerParticipant
    ? [organizerParticipant, ...invitees]
    : invitees;

  // Only these are in the draw. An invitee is not a participant until
  // they register; the organizer counts once they opt in.
  const participants = roster.filter(
    (person) =>
      person.id === ORGANIZER_ID ||
      person.status === "Registered"
  );

  // Restrictions whose two ends are both currently in the roster.
  // Keeps a removed person's restrictions from being shown or counted,
  // while leaving them intact in case that person comes back.
  const activeRestrictions = restrictions.filter(
    (restriction) =>
      roster.some(
        (participant) => participant.id === restriction.ownerId
      ) &&
      roster.some(
        (participant) => participant.id === restriction.otherId
      )
  );

const [inviteName, setInviteName] = useState("");
const [inviteEmail, setInviteEmail] = useState("");
  const [editingInviteeId, setEditingInviteeId] =
    useState<string | null>(null);
  const [restrictionEditorId, setRestrictionEditorId] =
    useState<string | null>(null);
  const [showAllRestrictions, setShowAllRestrictions] =
  useState(false);

  const nameForInvitee = (inviteeId: string) =>
    roster.find(
      (participant) => participant.id === inviteeId
    )?.name ??
    "Removed participant";

  const otherInvitees = (inviteeId: string) =>
    roster.filter(
      (participant) => participant.id !== inviteeId
    );

  const hasRestriction = (
    ownerId: string,
    otherId: string,
    direction: RestrictionDirection
  ) =>
    restrictions.some(
      (restriction) =>
        restriction.ownerId === ownerId &&
        restriction.otherId === otherId &&
        restriction.direction === direction
    );

  const setRestriction = (
    ownerId: string,
    otherId: string,
    direction: RestrictionDirection,
    restricted: boolean
  ) => {
    setRestrictions((previousRestrictions) => {
      const withoutThisOne = previousRestrictions.filter(
        (restriction) =>
          !(
            restriction.ownerId === ownerId &&
            restriction.otherId === otherId &&
            restriction.direction === direction
          )
      );

      return restricted
        ? [...withoutThisOne, { ownerId, otherId, direction }]
        : withoutThisOne;
    });
  };

  // A participant's own choices only - never restrictions others set
  // that happen to involve them.
  const restrictionsOwnedBy = (inviteeId: string) =>
    activeRestrictions.filter(
      (restriction) => restriction.ownerId === inviteeId
    );

  const restrictionCountFor = (inviteeId: string) =>
    restrictionsOwnedBy(inviteeId).length;

  // Sending the invitation moves everyone still pending to "Invited".
  // Registration (not built yet) is what moves them to "Registered".
  const markPendingAsInvited = () => {
    setInvitees((previousInvitees) =>
      previousInvitees.map((invitee) =>
        invitee.status === INVITE_PENDING
          ? { ...invitee, status: INVITED }
          : invitee
      )
    );
  };

  const removeInvitee = (inviteeId: string) => {
    setInvitees((previousInvitees) =>
      previousInvitees.filter(
        (invitee) => invitee.id !== inviteeId
      )
    );

    setRestrictions((previousRestrictions) =>
      previousRestrictions.filter(
        (restriction) =>
          restriction.ownerId !== inviteeId &&
          restriction.otherId !== inviteeId
      )
    );

    if (restrictionEditorId === inviteeId) {
      setRestrictionEditorId(null);
    }

    if (editingInviteeId === inviteeId) {
      setEditingInviteeId(null);
      setInviteName("");
      setInviteEmail("");
    }
  };
  const registrationDateValid =
  !registrationDeadline ||
  !drawDate ||
  registrationDeadline <= drawDate;
  
  const today = toIsoDate(new Date());


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
  const buildExchangeSnapshot = () => ({
    version: 1,
    eventName,
    drawDate,
    registrationDeadline,
    giftBudget,
    currency,
    noGiftLimit,
    remindBeforeRegistrationDeadline,
    remindBeforeDrawDate,
    organizer: {
      name: organizerName,
      email: organizerEmail,
      participating: includeOrganizer,
    },
    // A template is for a future run of the exchange, so nobody carries
    // over as already invited or registered.
    invitees: invitees.map((invitee) => ({
      ...invitee,
      status: INVITE_PENDING,
    })),
    restrictions,
  });

  const exportExchange = () => {
    const slug =
      eventName.trim().replace(/[^a-z0-9]+/gi, "-").toLowerCase() ||
      "mystery-name-draw";

    const blob = new Blob(
      [JSON.stringify(buildExchangeSnapshot(), null, 2)],
      { type: "application/json" }
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `${slug}.json`;
    link.click();

    URL.revokeObjectURL(url);
  };

  // Imported files are untrusted: read every field defensively rather
  // than trusting the shape.
  const applyExchangeSnapshot = (raw: unknown) => {
    if (typeof raw !== "object" || raw === null) {
      throw new Error("Not an exchange file");
    }

    const data = raw as Record<string, unknown>;

    const text = (value: unknown) =>
      typeof value === "string" ? value : "";

    const flag = (value: unknown, fallback: boolean) =>
      typeof value === "boolean" ? value : fallback;

    const isRecord = (
      value: unknown
    ): value is Record<string, unknown> =>
      typeof value === "object" && value !== null;

    const importedInvitees: Invitee[] = (
      Array.isArray(data.invitees) ? data.invitees : []
    )
      .filter(isRecord)
      .map((entry) => {
        const status = text(entry.status);

        return {
          id: text(entry.id) || createInviteeId(),
          name: text(entry.name).trim(),
          email: text(entry.email).trim(),
          status: INVITEE_STATUSES.includes(status)
            ? status
            : INVITE_PENDING,
        };
      })
      .filter((invitee) => invitee.name);

    const knownIds = new Set(
      importedInvitees.map((invitee) => invitee.id)
    );
    knownIds.add(ORGANIZER_ID);

    const importedRestrictions: Restriction[] = (
      Array.isArray(data.restrictions) ? data.restrictions : []
    )
      .filter(isRecord)
      .map((entry) => ({
        ownerId: text(entry.ownerId),
        otherId: text(entry.otherId),
        direction:
          text(entry.direction) === "receive"
            ? ("receive" as const)
            : ("give" as const),
      }))
      .filter(
        (restriction) =>
          restriction.ownerId !== restriction.otherId &&
          knownIds.has(restriction.ownerId) &&
          knownIds.has(restriction.otherId)
      );

    const organizer = isRecord(data.organizer) ? data.organizer : {};

    // A template from a previous year carries dates that have passed.
    // Roll them forward by whole years so the seasonal timing survives
    // (24 December stays 24 December) instead of importing as errors.
    const fileDrawDate = text(data.drawDate);
    const fileDeadline = text(data.registrationDeadline);
    const todayIso = toIsoDate(new Date());

    let yearsForward = 0;

    while (
      fileDrawDate &&
      shiftIsoDateByYears(fileDrawDate, yearsForward) < todayIso &&
      yearsForward < 20
    ) {
      yearsForward += 1;
    }

    const nextDrawDate = shiftIsoDateByYears(
      fileDrawDate,
      yearsForward
    );

    let nextDeadline = shiftIsoDateByYears(fileDeadline, yearsForward);

    // Keep the deadline on or before the draw, and not already past.
    if (
      nextDrawDate &&
      (!nextDeadline ||
        nextDeadline > nextDrawDate ||
        nextDeadline < todayIso)
    ) {
      const fallback = new Date(`${nextDrawDate}T00:00:00`);
      fallback.setDate(fallback.getDate() - 5);
      nextDeadline = toIsoDate(fallback);
    }

    setEventName(text(data.eventName));
    setDrawDate(nextDrawDate);
    setRegistrationDeadline(nextDeadline);
    setRegistrationDateTouched(true);
    setGiftBudget(text(data.giftBudget));
    setCurrency(text(data.currency) || "USD");
    setNoGiftLimit(flag(data.noGiftLimit, false));
    setRemindBeforeRegistrationDeadline(
      flag(data.remindBeforeRegistrationDeadline, true)
    );
    setRemindBeforeDrawDate(flag(data.remindBeforeDrawDate, true));

    setOrganizerName(text(organizer.name));
    setOrganizerEmail(text(organizer.email));
    setIncludeOrganizer(flag(organizer.participating, true));

    setInvitees(importedInvitees);
    setRestrictions(importedRestrictions);

    setEditingInviteeId(null);
    setRestrictionEditorId(null);
    setShowAllRestrictions(false);
    setInviteName("");
    setInviteEmail("");
    setCopied(false);
    setRegistrationOpen(true);

    // A template should never reuse the code of the exchange it came
    // from, or old invitation links would point at the new event.
    setEventCode(generateEventCode());
    setEmailSubject(
      `You're Invited to Join ${
        text(data.eventName) || "This Gift Exchange"
      }`
    );

    // Land on the invitation page when there is a list to work with.
    setCurrentStep(importedInvitees.length > 0 ? 4 : 1);

    return {
      count: importedInvitees.length,
      yearsForward,
      drawDate: nextDrawDate,
    };
  };

  const handleImportFile = async (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];

    event.target.value = "";

    if (!file) {
      return;
    }

    const hasExchangeData =
      eventName.trim() || organizerName.trim() || invitees.length > 0;

    if (
      hasExchangeData &&
      !window.confirm(
        "Import this exchange?\n\nIt will replace the exchange you have open."
      )
    ) {
      return;
    }

    try {
      const result = applyExchangeSnapshot(
        JSON.parse(await file.text())
      );

      const dateNote =
        result.yearsForward > 0
          ? ` Dates were moved forward to ${result.drawDate.slice(
              0,
              4
            )}, so check they still suit you.`
          : "";

      alert(
        `Exchange imported with ${result.count} ${
          result.count === 1 ? "invitee" : "invitees"
        }.${dateNote} A new event code was generated.`
      );
    } catch {
      alert(
        "That file could not be imported. It should be a Mystery Name Draw JSON file."
      );
    }
  };

  const resetExchange = () => {
    setEventName("");
    setDrawDate("");
    setRegistrationDeadline("");
    setRegistrationDateTouched(false);
    setGiftBudget("");
    setCurrency("USD");
    setNoGiftLimit(false);
    setRemindBeforeRegistrationDeadline(true);
    setRemindBeforeDrawDate(true);

    setEventCode("");
    setCopied(false);
    setRegistrationOpen(true);

    setInvitees([]);
    setRestrictions([]);
    setInviteName("");
    setInviteEmail("");
    setEditingInviteeId(null);
    setRestrictionEditorId(null);
    setShowAllRestrictions(false);
    setIncludeOrganizer(true);
    setOrganizerName("");
    setOrganizerEmail("");
    setEmailSubject("");

    setCurrentStep(1);
  };
  const currencySymbols: Record<string, string> = {
    USD: "$",
    CAD: "$",
    GBP: "\u00A3",
    EUR: "\u20AC",
    AUD: "$",
  };

  const giftBudgetLabel = noGiftLimit
    ? "No limit"
    : giftBudget.trim()
    ? `${currencySymbols[currency] ?? ""}${giftBudget} ${currency}`
    : "Not set";

  const reminderSummary =
    remindBeforeRegistrationDeadline && remindBeforeDrawDate
      ? "Registration deadline and draw date"
      : remindBeforeRegistrationDeadline
      ? "Registration deadline"
      : remindBeforeDrawDate
      ? "Draw date"
      : "No reminders";

  const registrationLink = `https://mysterynamedraw.com/event/${eventCode}`;

  // One source for both the on-screen preview and the copy/email/text
  // versions, so the wording cannot drift apart.
  const invitationIntro = `You've been invited to participate in ${
    eventName || "this gift exchange"
  }.`;

  const invitationDetails = [
    {
      label: "Registration Deadline",
      value: formatDate(registrationDeadline),
    },
    { label: "Draw Date", value: formatDate(drawDate) },
    { label: "Gift Budget", value: giftBudgetLabel },
  ];

  const registrationNote =
    "When you register, you can add your gift preferences and set your own name draw restrictions: anyone you would rather not give to or receive from.";

  const reminderNote =
    !remindBeforeRegistrationDeadline && !remindBeforeDrawDate
      ? "No reminders will be sent for this exchange."
      : `${
          remindBeforeRegistrationDeadline && remindBeforeDrawDate
            ? "We'll email you a reminder before the registration deadline and again before the draw date."
            : remindBeforeRegistrationDeadline
            ? "We'll email you a reminder before the registration deadline."
            : "Once you've registered, we'll email you a reminder before the draw date."
        } You can opt out of reminders at any time.`;

  const invitationMessage = `Hello,

${invitationIntro}

${invitationDetails
  .map((detail) => `${detail.label}:\n${detail.value}`)
  .join("\n\n")}

${registrationNote}

${reminderNote}

Register here for the gift exchange:

${registrationLink}

We hope you'll join us!
`;
const addInvitee = () => {
  if (!inviteName.trim() || !inviteEmail.trim()) {
    return;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRegex.test(inviteEmail.trim())) {
    alert("Please enter a valid email address.");
    return;
  }

  const name = inviteName.trim();
  const email = inviteEmail.trim();

  if (editingInviteeId !== null) {
    // Keyed by id, so renaming someone keeps their restrictions intact.
    setInvitees((previousInvitees) =>
      previousInvitees.map((invitee) =>
        invitee.id === editingInviteeId
          ? { ...invitee, name, email }
          : invitee
      )
    );

    setEditingInviteeId(null);
  } else {
    setInvitees((previousInvitees) => [
      ...previousInvitees,
      {
        id: createInviteeId(),
        name,
        email,
        status: INVITE_PENDING,
      },
    ]);
  }

  setInviteName("");
  setInviteEmail("");

  participantNameRef.current?.focus();
};  
return (
    <>
      <Header
  onStartExchange={() => {

    const hasExchangeData =
      eventName.trim() ||
      drawDate ||
      registrationDeadline ||
      giftBudget ||
      eventCode ||
      organizerName.trim() ||
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


  <div className="exchange-io">
    <label className="secondary-button file-button">
      Import Exchange / Template
      <input
        type="file"
        accept="application/json,.json"
        onChange={handleImportFile}
      />
    </label>
  </div>

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
    Remind roster before the draw date
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

)}
{currentStep === 3 && (

<div className="wizard-card">

  <h2>✅ Gift Exchange Created</h2>

  <p className="step-description">
  Your gift exchange is ready.
</p>

<p className="step-description next-step-text">
  Next, invite roster to register using the link below.
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
    defaultChecked
  />
  Allow roster to invite others
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
⏳ Give roster enough shopping time after the draw date.
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
  editingInviteeId !== null
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

  {roster.map((participant) => {
    const isOrganizer = participant.id === ORGANIZER_ID;

    return (
      <div
        key={participant.id}
        className="invitee-row"
      >
        <span>{participant.name}</span>
        <span>{participant.email || "\u2014"}</span>

        <div className="invitee-actions">
          {isOrganizer ? (
            <span className="helper-text">
              Edit in Settings
            </span>
          ) : (
            <>
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setInviteName(participant.name);
                  setInviteEmail(participant.email);
                  setEditingInviteeId(participant.id);
                }}
              >
                Edit
              </button>

              <button
                type="button"
                className="secondary-button remove-button"
                onClick={() => removeInvitee(participant.id)}
              >
                Remove
              </button>
            </>
          )}
        </div>

        <span className="invitee-status">
          {isOrganizer
            ? "Organizer"
            : participant.status === REGISTERED
            ? "\u2705 Registered"
            : participant.status === INVITED
            ? "\u{1F4E7} Invited"
            : "\u26AA Invite Pending"}
        </span>

        <div className="invitee-restrictions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setRestrictionEditorId(participant.id);

              setTimeout(() => {
                document
                  .getElementById("restriction-editor")
                  ?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  });
              }, 100);
            }}
          >
            Manage ({restrictionCountFor(participant.id)})
          </button>
        </div>
      </div>
    );
  })}
{restrictionEditorId !== null && (
  <div
    id="restriction-editor"
    className="restriction-editor"
  >
    <div className="restriction-editor-header">
      <h3>
        Restrictions for{" "}
        {nameForInvitee(restrictionEditorId)}
      </h3>

      <button
        type="button"
        className="secondary-button"
        onClick={() => setRestrictionEditorId(null)}
      >
        Hide Restrictions
      </button>
    </div>

    <p className="helper-text">
      These are{" "}
      {nameForInvitee(restrictionEditorId)}&rsquo;s own choices, and
      they appear on this list only. Each one works in a single
      direction, so blocking a gift one way does not block the other
      way.
    </p>

    {otherInvitees(restrictionEditorId).length === 0 ? (
      <p className="helper-text">
        Add at least two roster to set restrictions.
      </p>
    ) : (
      <div className="restriction-sections">

        <div className="restriction-section">
          <h4>Won&rsquo;t give to</h4>

          <p className="helper-text">
            {nameForInvitee(restrictionEditorId)} will not be
            assigned to buy for anyone checked here.
          </p>

          {otherInvitees(restrictionEditorId).map((other) => (
            <label
              key={other.id}
              className="checkbox-inline"
            >
              <input
                type="checkbox"
                checked={hasRestriction(
                  restrictionEditorId,
                  other.id,
                  "give"
                )}
                onChange={(e) =>
                  setRestriction(
                    restrictionEditorId,
                    other.id,
                    "give",
                    e.target.checked
                  )
                }
              />
              {other.name}
            </label>
          ))}
        </div>

        <div className="restriction-section">
          <h4>Won&rsquo;t receive from</h4>

          <p className="helper-text">
            Nobody checked here will be assigned to buy for{" "}
            {nameForInvitee(restrictionEditorId)}.
          </p>

          {otherInvitees(restrictionEditorId).map((other) => (
            <label
              key={other.id}
              className="checkbox-inline"
            >
              <input
                type="checkbox"
                checked={hasRestriction(
                  restrictionEditorId,
                  other.id,
                  "receive"
                )}
                onChange={(e) =>
                  setRestriction(
                    restrictionEditorId,
                    other.id,
                    "receive",
                    e.target.checked
                  )
                }
              />
              {other.name}
            </label>
          ))}
        </div>

      </div>
    )}
  </div>
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

    <h3>All Restrictions ({activeRestrictions.length})</h3>

    {activeRestrictions.length === 0 ? (
      <p className="helper-text">
        No restrictions have been set.
      </p>
    ) : (
      roster.map((invitee) => {
        const ownRestrictions = restrictionsOwnedBy(invitee.id);

        if (ownRestrictions.length === 0) {
          return null;
        }

        const willNotGiveTo = ownRestrictions
          .filter(
            (restriction) => restriction.direction === "give"
          )
          .map((restriction) =>
            nameForInvitee(restriction.otherId)
          );

        const willNotReceiveFrom = ownRestrictions
          .filter(
            (restriction) => restriction.direction === "receive"
          )
          .map((restriction) =>
            nameForInvitee(restriction.otherId)
          );

        return (
          <div
            key={invitee.id}
            className="restriction-summary"
          >
            <strong>{invitee.name}</strong>

            {willNotGiveTo.length > 0 && (
              <p>
                Won&rsquo;t give to: {willNotGiveTo.join(", ")}
              </p>
            )}

            {willNotReceiveFrom.length > 0 && (
              <p>
                Won&rsquo;t receive from:{" "}
                {willNotReceiveFrom.join(", ")}
              </p>
            )}
          </div>
        );
      })
    )}

  </div>
)}
<h3>Participants</h3>

<p className="helper-text">
  Only people who have registered are in the draw. Invitees appear here
  once they register. Change whether you take part in Settings.
</p>

<div className="created-participants">
  <p>
    <strong>
      {participants.length}{" "}
      {participants.length === 1
        ? "Participant"
        : "Participants"}
    </strong>
  </p>

  {participants.length === 0 ? (
    <p className="helper-text">
      Nobody has registered yet.
    </p>
  ) : (
    <ul>
      {participants.map((participant) => (
        <li key={participant.id}>
          {participant.name}
          {participant.id === ORGANIZER_ID
            ? " (organizer)"
            : ""}
        </li>
      ))}
    </ul>
  )}
</div>

  <h3>Registration Link</h3>

<div className="signup-link">
  {registrationLink}
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
  
    markPendingAsInvited();

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

    markPendingAsInvited();

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

  <label className="email-subject-label">
    <strong>Subject:</strong>

    <input
      className="email-subject-input"
      type="text"
      value={emailSubject}
      onChange={(e) => setEmailSubject(e.target.value)}
    />
  </label>

</div>

  <hr />

  <div className="email-preview-body">
    <p>Hello,</p>

    <p>{invitationIntro}</p>

    {invitationDetails.map((detail) => (
      <p key={detail.label}>
        <strong>{detail.label}:</strong>
        <br />
        {detail.value}
      </p>
    ))}

    <p>{registrationNote}</p>

    <p>{reminderNote}</p>

    <p>Register here for the gift exchange:</p>

    <p className="email-preview-link">{registrationLink}</p>

    <p>We hope you&rsquo;ll join us!</p>
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
          "Close registration?\n\nNew roster will no longer be able to join this event."
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