import { useExchangeContext } from "../../exchange/context";

/** Step 6: whether a draw is possible, and what blocks it. */
export default function ValidationStep() {
  const {
    eventName,
    setCurrentStep,
    drawDate,
    formatDate,
    participants,
    activeRestrictions,
    overrideNotices,
    forbiddenPairings,
    drawCheck,
    removalSuggestion,
    distinctPairingCount,
    formatList,
    formatNames,
    describePairing,
    removePairing,
  } = useExchangeContext();

  return (
      <div className="wizard-card">

        <div className="exchange-title-section">
          <h3>{eventName || "Unnamed Gift Exchange"}</h3>
        </div>

        <h2>Draw Validation</h2>

        <p className="step-description">
          Check that everyone can be given someone to buy for, before the
          draw date arrives.
        </p>

        <div className="draw-summary">
          <span>
            <strong>{participants.length}</strong>{" "}
            {participants.length === 1 ? "participant" : "participants"}
          </span>

          <span>
            <strong>{distinctPairingCount}</strong>{" "}
            {distinctPairingCount === 1
              ? "blocked pairing"
              : "blocked pairings"}
            {forbiddenPairings.length !== distinctPairingCount
              ? ` (from ${forbiddenPairings.length} restrictions)`
              : ""}
          </span>
        </div>

        {activeRestrictions.length > forbiddenPairings.length && (
          <p className="helper-text">
            {activeRestrictions.length - forbiddenPairings.length} restriction
            {activeRestrictions.length - forbiddenPairings.length === 1
              ? " involves someone who has"
              : "s involve people who have"}{" "}
            not registered, so {
              activeRestrictions.length - forbiddenPairings.length === 1
                ? "it does"
                : "they do"
            } not affect this draw.
          </p>
        )}

        {participants.length < 2 ? (
          <div className="draw-status draw-status-waiting">
            <h3>Not enough participants yet</h3>

            <p>
              A draw needs at least two registered participants. Invitees
              join this list once they register.
            </p>
          </div>
        ) : drawCheck.ok ? (
          <div className="draw-status draw-status-ok">
            <h3>This draw will work</h3>

            <p>
              Everyone can be given someone to buy for without breaking a
              restriction. The draw runs on {formatDate(drawDate)}.
            </p>

            <p className="helper-text">
              Assignments aren't shown here. Nobody sees who drew whom,
              including you.
            </p>
          </div>
        ) : (
          <div className="draw-status draw-status-blocked">
            <h3>This draw can't be completed</h3>

            <p>
              {drawCheck.availableReceiverIds.length === 0
                ? `${formatNames(
                    drawCheck.blockedGiverIds
                  )} can't be matched to anyone.`
                : `${formatNames(
                    drawCheck.blockedGiverIds
                  )} can only be matched to ${formatNames(
                    drawCheck.availableReceiverIds
                  )}, which isn't enough to go round.`}
            </p>

            {removalSuggestion?.status === "remove" ? (
              <>
                <p>
                  {removalSuggestion.size === 1
                    ? "Removing any one of these restrictions would fix it:"
                    : `Removing a single restriction won't be enough here. At least ${removalSuggestion.size} have to go, for example:`}
                </p>

                <div className="removal-options">
                  {removalSuggestion.options.map((option, optionIndex) => (
                    <div
                      key={optionIndex}
                      className="removal-option"
                    >
                      {removalSuggestion.size > 1 && (
                        <div className="removal-option-label">
                          Option {optionIndex + 1}
                        </div>
                      )}

                      <ul>
                        {option.map((pairing, pairingIndex) => {
                          const described = describePairing(pairing);

                          return (
                            <li key={pairingIndex}>
                              <div className="removal-detail">
                                <span>{described.pairing}</span>

                                <span className="helper-text">
                                  {described.doubled
                                    ? `Set by ${formatList(
                                        described.owners
                                      )}. Both restrictions are removed together, or the pairing stays blocked.`
                                    : `${described.owners[0]}\u2019s choice.`}
                                </span>
                              </div>

                              <button
                                type="button"
                                className="secondary-button remove-button"
                                onClick={() => removePairing(pairing)}
                              >
                                Remove
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p>
                No small set of removals fixes this. The restrictions are too
                tight for this group: remove several of them, or add more
                participants.
              </p>
            )}
          </div>
        )}

        {overrideNotices.length > 0 && (
          <div className="override-notices">
            <h3>Restrictions you've removed</h3>

            <p className="helper-text">
              Mystery Name Draw doesn't tell participants when their
              restriction is removed. Please let them know yourself.
            </p>

            <ul>
              {overrideNotices.map((notice, index) => (
                <li key={index}>{notice}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="wizard-navigation">
          <button
            type="button"
            className="back-button"
            onClick={() => setCurrentStep(5)}
          >
            ← Back
          </button>
        </div>

      </div>
  );
}
