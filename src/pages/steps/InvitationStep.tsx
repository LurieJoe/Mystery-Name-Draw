import {
  ORGANIZER_ID,
  INVITED,
  REGISTERED,
} from "../../exchange/types";
import SendInvitations from "./SendInvitations";
import { useExchangeContext } from "../../exchange/context";

/** Step 4: the invitation list, restrictions, and the email preview. */
export default function InvitationStep() {
  const {
    eventName,
    setCurrentStep,
    emailSubject,
    setEmailSubject,
    participantNameRef,
    copyLink,
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
    nameForInvitee,
    otherInvitees,
    hasRestriction,
    restrictionIsTheirs,
    setRestriction,
    restrictionsOwnedBy,
    restrictionCountFor,
    removeInvitee,
    registrationLink,
    invitationIntro,
    invitationDetails,
    registrationNote,
    reminderNote,
    invitationMessage,
    addInvitee,
  } = useExchangeContext();

  return (

    <div className="wizard-card">

    <div className="exchange-title-section">
      <h3>{eventName || "Unnamed Gift Exchange"}</h3>
    </div>

     <h3>Share your event link and track participant registrations.</h3>


     <h3>Invitation List</h3>
 
    {editingInviteeId !== null && (
      <p className="editing-banner" role="status">
        Editing <strong>{nameForInvitee(editingInviteeId)}</strong>.
        Change what you need and choose Save Changes.
      </p>
    )}

    <div className="invitee-entry-row" id="invitee-entry">

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

      {editingInviteeId !== null && (
        <button
          type="button"
          className="secondary-button"
          onClick={() => {
            setEditingInviteeId(null);
            setInviteName("");
            setInviteEmail("");
          }}
        >
          Cancel
        </button>
      )}

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

                      /*
                       * Take them to the form, which is at the top of
                       * a list that can run to a dozen people. Filling
                       * it silently looked exactly like a button that
                       * did nothing, and the obvious next move - add
                       * the person again - makes two of them, and two
                       * people buying for one.
                       */
                      setTimeout(() => {
                        document
                          .getElementById("invitee-entry")
                          ?.scrollIntoView({
                            behavior: "smooth",
                            block: "center",
                          });

                        participantNameRef.current?.focus();
                      }, 50);
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
          Set here, these are yours and {nameForInvitee(restrictionEditorId)}{" "}
          never sees them. Anything they chose themselves is shown as
          theirs and stays theirs. Each one works in a single
          direction, so blocking a gift one way doesn't block the other
          way.
        </p>

        {otherInvitees(restrictionEditorId).length === 0 ? (
          <p className="helper-text">
            Add at least two participants to set restrictions.
          </p>
        ) : (
          <div className="restriction-sections">

            <div className="restriction-section">
              <h4>Won't give to</h4>

              <p className="helper-text">
                {nameForInvitee(restrictionEditorId)} won't be
                assigned to buy for anyone checked here.
              </p>

              {otherInvitees(restrictionEditorId).map((other) => (
                <RestrictionBox
                  key={other.id}
                  name={other.name}
                  checked={hasRestriction(
                    restrictionEditorId,
                    other.id,
                    "give"
                  )}
                  theirs={restrictionIsTheirs(
                    restrictionEditorId,
                    other.id,
                    "give"
                  )}
                  onChange={(on) =>
                    setRestriction(restrictionEditorId, other.id, "give", on)
                  }
                />
              ))}
            </div>

            <div className="restriction-section">
              <h4>Won't receive from</h4>

              <p className="helper-text">
                Nobody checked here will be assigned to buy for{" "}
                {nameForInvitee(restrictionEditorId)}.
              </p>

              {otherInvitees(restrictionEditorId).map((other) => (
                <RestrictionBox
                  key={other.id}
                  name={other.name}
                  checked={hasRestriction(
                    restrictionEditorId,
                    other.id,
                    "receive"
                  )}
                  theirs={restrictionIsTheirs(
                    restrictionEditorId,
                    other.id,
                    "receive"
                  )}
                  onChange={(on) =>
                    setRestriction(
                      restrictionEditorId,
                      other.id,
                      "receive",
                      on
                    )
                  }
                />
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
                    Won't give to: {willNotGiveTo.join(", ")}
                  </p>
                )}

                {willNotReceiveFrom.length > 0 && (
                  <p>
                    Won't receive from:{" "}
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

      {/* The way to invite people, on the screen people come to in
          order to invite people. It was on the two screens either
          side of this one and not on this one, which is the screen
          that is actually about invitations. */}
      <SendInvitations />

      <h3>Sharing the link yourself</h3>

      <p className="helper-text">
        If you'd rather send it your own way, here's the same
        invitation to copy. The link below is shared by everyone, so
        it's the one to use in a group chat.
      </p>

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
  
        alert(
          "Copied. Paste it into your email application."
        );
      }}
    >
      Copy for email
    </button>

    <button
      type="button"
      className="secondary-button"
      onClick={async () => {
        await navigator.clipboard.writeText(
          invitationMessage
        );

        alert(
          "Copied. Paste it into a text message."
        );
      }}
    >
      Copy for a text message
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

        <p>We hope you'll join us!</p>
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
          Manage Exchange / Save Template →
        </button>

      </div>

    </div>
  );
}

/**
 * One restriction box.
 *
 * Two states that look alike and are not: a box the organizer ticked,
 * which they may untick, and one the participant ticked on their own
 * page, which is theirs. The second is shown rather than hidden,
 * because an organizer looking at a draw that will not resolve needs
 * to see every constraint, but it is not offered as something to
 * undo: the database would refuse, and more to the point it is not
 * the organizer's choice to reverse.
 */
function RestrictionBox({
  name,
  checked,
  theirs,
  onChange,
}: {
  name: string;
  checked: boolean;
  theirs: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <label
      className={`checkbox-inline${theirs ? " restriction-theirs" : ""}`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={theirs}
        onChange={(event) => onChange(event.target.checked)}
      />
      {name}
      {theirs && <span className="restriction-note">their choice</span>}
    </label>
  );
}
