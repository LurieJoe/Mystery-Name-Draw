import {
  ORGANIZER_ID,
  INVITED,
  REGISTERED,
} from "../../exchange/types";
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
    setRestriction,
    restrictionsOwnedBy,
    restrictionCountFor,
    markPendingAsInvited,
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
            Add at least two participants to set restrictions.
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
  );
}
