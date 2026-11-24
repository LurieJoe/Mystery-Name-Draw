import { useState, useRef, useMemo } from "react";
import type { ChangeEvent } from "react";
import {
  createSeededRandom,
  distinctForbiddenPairings,
  findAssignment,
  suggestedRemovals,
  type ForbiddenPairing,
} from "../draw/assignment";
import { downloadFile, slugify } from "../downloadFile";
import {
  removalConfirmation,
  removalNotice,
  removalOwners,
} from "./restrictionNotices";
import { routeUrl } from "../router";
import {
  createInviteeId,
  isValidEmail,
  shiftIsoDateByYears,
  toIsoDate,
  INVITED,
  INVITEE_STATUSES,
  INVITE_PENDING,
  ORGANIZER_ID,
  REGISTERED,
  type Invitee,
  type Restriction,
  type RestrictionDirection,
} from "./types";

/**
 * Every piece of exchange state, plus the actions over it.
 *
 * One hook rather than scattered state so the wizard steps stay
 * presentational and can be split into files without threading dozens
 * of props through each of them.
 */
export function useExchange() {
  const [eventName, setEventName] = useState("");
const [copied, setCopied] = useState(false);
const [currentStep, setCurrentStep] = useState(1);
const [currency, setCurrency] = useState("USD");
const [eventCode, setEventCode] = useState("");
const [registrationOpen, setRegistrationOpen] = useState(true);
const [includeOrganizer, setIncludeOrganizer] =
  useState(true);
const [organizerTouched, setOrganizerTouched] = useState(false);
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

  const organizerParticipant: Invitee | null = useMemo(
    () =>
      includeOrganizer && organizerName.trim()
        ? {
            id: ORGANIZER_ID,
            name: organizerName.trim(),
            email: organizerEmail.trim(),
            status: "Organizer",
          }
        : null,
    [includeOrganizer, organizerName, organizerEmail]
  );

  // Everyone the organizer manages: the organizer plus every invitee,
  // whatever their status.
  const roster: Invitee[] = useMemo(
    () =>
      organizerParticipant
        ? [organizerParticipant, ...invitees]
        : invitees,
    [organizerParticipant, invitees]
  );

  // Only these are in the draw. An invitee is not a participant until
  // they register; the organizer counts once they opt in.
  const participants = useMemo(
    () =>
      roster.filter(
        (person) =>
          person.id === ORGANIZER_ID || person.status === REGISTERED
      ),
    [roster]
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
  const [overrideNotices, setOverrideNotices] = useState<string[]>([]);

  // Restrictions become forbidden giver/receiver pairings. Only people
  // actually in the draw count, so a restriction naming someone who
  // never registered simply does not apply.
  const forbiddenPairings: ForbiddenPairing[] = useMemo(
    () =>
      restrictions
        .filter(
          (restriction) =>
            participants.some((p) => p.id === restriction.ownerId) &&
            participants.some((p) => p.id === restriction.otherId)
        )
        .map((restriction) =>
          restriction.direction === "give"
            ? {
                giverId: restriction.ownerId,
                receiverId: restriction.otherId,
              }
            : {
                giverId: restriction.otherId,
                receiverId: restriction.ownerId,
              }
        ),
    [restrictions, participants]
  );

  const drawPeople = useMemo(
    () =>
      participants.map((person) => ({
        id: person.id,
        name: person.name,
      })),
    [participants]
  );

  /**
   * Whether a draw is possible. Seeded so the answer does not change
   * between renders. Only `ok` is read here - the organizer must never
   * see who drew whom.
   */
  const drawCheck = useMemo(
    () =>
      findAssignment(
        drawPeople,
        forbiddenPairings,
        createSeededRandom("validation")
      ),
    [drawPeople, forbiddenPairings]
  );

  // Searching for removals runs many matchings, so only do it on the
  // validation screen, and only when there is a problem to solve.
  const removalSuggestion = useMemo(
    () =>
      currentStep !== 6 || drawCheck.ok
        ? null
        : suggestedRemovals(
            drawPeople,
            forbiddenPairings,
            createSeededRandom("suggestions"),
            2,
            3
          ),
    [currentStep, drawCheck.ok, drawPeople, forbiddenPairings]
  );

  const distinctPairingCount = useMemo(
    () => distinctForbiddenPairings(drawPeople, forbiddenPairings).length,
    [drawPeople, forbiddenPairings]
  );

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
  /**
   * A participant registering themselves.
   *
   * Matched on email so somebody the organizer already invited fills in
   * their own row rather than appearing twice. Returns their id, which
   * is what their restrictions are keyed to.
   */
  const registerParticipant = (details: {
    name: string;
    email: string;
    wishlist: string;
    preferences: string;
  }) => {
    const name = details.name.trim();
    const email = details.email.trim();
    const wishlist = details.wishlist.trim();
    const preferences = details.preferences.trim();

    const existing = invitees.find(
      (invitee) =>
        invitee.email.toLowerCase() === email.toLowerCase()
    );
    const id = existing ? existing.id : createInviteeId();

    setInvitees((previousInvitees) =>
      previousInvitees.some((invitee) => invitee.id === id)
        ? previousInvitees.map((invitee) =>
            invitee.id === id
              ? {
                  ...invitee,
                  name,
                  email,
                  wishlist,
                  preferences,
                  status: REGISTERED,
                }
              : invitee
          )
        : [
            ...previousInvitees,
            {
              id,
              name,
              email,
              wishlist,
              preferences,
              status: REGISTERED,
            },
          ]
    );

    return id;
  };

  const markPendingAsInvited = () => {
    setInvitees((previousInvitees) =>
      previousInvitees.map((invitee) =>
        invitee.status === INVITE_PENDING
          ? { ...invitee, status: INVITED }
          : invitee
      )
    );
  };

  /**
   * The restriction records that produce a forbidden pairing.
   *
   * There can be two: one person refusing to give, the other refusing
   * to receive. Both have to go or the pairing stays blocked, which
   * would look to the organizer like the removal did nothing.
   */
  /** "A", "A and B", "A, B, and C" - Oxford comma. */
  const formatList = (items: string[]) => {
    if (items.length <= 1) {
      return items[0] ?? "";
    }

    if (items.length === 2) {
      return `${items[0]} and ${items[1]}`;
    }

    return `${items.slice(0, -1).join(", ")}, and ${
      items[items.length - 1]
    }`;
  };

  const formatNames = (ids: string[]) =>
    formatList(ids.map(nameForInvitee));

  const recordsForPairing = (pairing: ForbiddenPairing) =>
    restrictions.filter(
      (restriction) =>
        (restriction.direction === "give" &&
          restriction.ownerId === pairing.giverId &&
          restriction.otherId === pairing.receiverId) ||
        (restriction.direction === "receive" &&
          restriction.ownerId === pairing.receiverId &&
          restriction.otherId === pairing.giverId)
    );

  const describePairing = (pairing: ForbiddenPairing) => {
    const records = recordsForPairing(pairing);
    const owners = [
      ...new Set(records.map((record) => nameForInvitee(record.ownerId))),
    ];

    return {
      pairing: `${nameForInvitee(
        pairing.giverId
      )} must not be assigned to buy for ${nameForInvitee(
        pairing.receiverId
      )}`,
      owners,
      doubled: records.length > 1,
    };
  };

  const removePairing = (pairing: ForbiddenPairing) => {
    const records = recordsForPairing(pairing);

    if (records.length === 0) {
      return;
    }

    const giverName = nameForInvitee(pairing.giverId);
    const receiverName = nameForInvitee(pairing.receiverId);

    // Both sources are honoured, so a pairing can be the organizer's own
    // doing, a participant's, or both. Who has to be told differs.
    const owners = removalOwners(records, nameForInvitee);

    const confirmed = window.confirm(
      removalConfirmation(owners, records.length, giverName, receiverName)
    );

    if (!confirmed) {
      return;
    }

    setRestrictions((previousRestrictions) =>
      previousRestrictions.filter(
        (restriction) =>
          !(
            (restriction.direction === "give" &&
              restriction.ownerId === pairing.giverId &&
              restriction.otherId === pairing.receiverId) ||
            (restriction.direction === "receive" &&
              restriction.ownerId === pairing.receiverId &&
              restriction.otherId === pairing.giverId)
          )
      )
    );

    setOverrideNotices((previousNotices) => [
      ...previousNotices,
      removalNotice(owners, records.length, giverName, receiverName),
    ]);
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


  /**
   * Restrictions open once registration has closed, so that everyone
   * chooses against the final roster rather than a partial one, and
   * stay open until the draw itself.
   */
  const restrictionsOpen =
    !!registrationDeadline &&
    !!drawDate &&
    today > registrationDeadline &&
    today <= drawDate;

  const drawHasPassed = !!drawDate && today > drawDate;

  const registrationDeadlineInPast =
  !!registrationDeadline &&
  registrationDeadline < today;

  // Whether the details are wrong, and separately whether to say so
  // yet. The form is invalid from first load; the complaint waits.
  const organizerNameMissing =
    includeOrganizer && !organizerName.trim();

  const organizerEmailMissing =
    includeOrganizer && !organizerEmail.trim();

  const showOrganizerErrors = organizerTouched;

  const organizerEmailInvalid =
    !!organizerEmail.trim() && !isValidEmail(organizerEmail);

  const organizerDetailsValid =
    !organizerNameMissing &&
    !organizerEmailMissing &&
    !organizerEmailInvalid;

  const formValid =
  eventName.trim() &&
  drawDate &&
  registrationDeadline &&
  registrationDateValid &&
  !registrationDeadlineInPast &&
  organizerDetailsValid;
 
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
    downloadFile(
      `${slugify(eventName, "mystery-name-draw")}.json`,
      JSON.stringify(buildExchangeSnapshot(), null, 2),
      "application/json"
    );
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
          wishlist: text(entry.wishlist),
          preferences: text(entry.preferences),
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

    // Land on Review & Create: it shows the dates, budget, reminders
    // and participation that came out of the file, so the organizer is
    // looking at exactly what needs checking rather than being told to
    // go and check it.
    setCurrentStep(2);

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
          ? `Dates were moved forward to ${result.drawDate.slice(
              0,
              4
            )}.\n\n`
          : "";

      // Everything below came out of the file rather than from the
      // organizer, so say plainly what needs checking.
      alert(
        `Imported ${result.count} ${
          result.count === 1 ? "invitee" : "invitees"
        }.\n\n` +
          dateNote +
          "A new event code was generated, so invitation links from the original exchange will no longer work.\n\n" +
          "Review the draw date, registration deadline, gift budget, and reminder settings below before creating the exchange."
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
    setOverrideNotices([]);
    setIncludeOrganizer(true);
    setOrganizerTouched(false);
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

  const registrationLink = routeUrl(`/event/${eventCode}`);

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

  if (!isValidEmail(inviteEmail)) {
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

  return {
    eventName,
    setEventName,
    copied,
    setCopied,
    currentStep,
    setCurrentStep,
    currency,
    setCurrency,
    eventCode,
    setEventCode,
    registrationOpen,
    setRegistrationOpen,
    includeOrganizer,
    setIncludeOrganizer,
    organizerName,
    setOrganizerName,
    organizerEmail,
    setOrganizerEmail,
    emailSubject,
    setEmailSubject,
    registrationDateTouched,
    setRegistrationDateTouched,
    registrationDeadline,
    setRegistrationDeadline,
    drawDate,
    setDrawDate,
    giftBudget,
    setGiftBudget,
    noGiftLimit,
    setNoGiftLimit,
    remindBeforeRegistrationDeadline,
    setRemindBeforeRegistrationDeadline,
    remindBeforeDrawDate,
    setRemindBeforeDrawDate,
    participantNameRef,
    copyLink,
    formatDate,
    invitees,
    setInvitees,
    restrictions,
    setRestrictions,
    organizerParticipant,
    roster,
    participants,
    activeRestrictions,
    inviteName,
    setInviteName,
    inviteEmail,
    setInviteEmail,
    editingInviteeId,
    setEditingInviteeId,
    restrictionEditorId,
    setRestrictionEditorId,
    showAllRestrictions,
    setShowAllRestrictions,
    overrideNotices,
    setOverrideNotices,
    forbiddenPairings,
    drawPeople,
    drawCheck,
    removalSuggestion,
    distinctPairingCount,
    nameForInvitee,
    otherInvitees,
    hasRestriction,
    setRestriction,
    restrictionsOwnedBy,
    restrictionCountFor,
    markPendingAsInvited,
    registerParticipant,
    formatList,
    formatNames,
    recordsForPairing,
    describePairing,
    removePairing,
    removeInvitee,
    registrationDateValid,
    today,
    registrationDeadlineInPast,
    restrictionsOpen,
    drawHasPassed,
    formValid,
    organizerTouched,
    setOrganizerTouched,
    organizerNameMissing,
    organizerEmailMissing,
    organizerEmailInvalid,
    organizerDetailsValid,
    showOrganizerErrors,
    generateEventCode,
    buildExchangeSnapshot,
    exportExchange,
    applyExchangeSnapshot,
    handleImportFile,
    resetExchange,
    currencySymbols,
    giftBudgetLabel,
    reminderSummary,
    registrationLink,
    invitationIntro,
    invitationDetails,
    registrationNote,
    reminderNote,
    invitationMessage,
    addInvitee,
  };
}

export type ExchangeState = ReturnType<typeof useExchange>;
