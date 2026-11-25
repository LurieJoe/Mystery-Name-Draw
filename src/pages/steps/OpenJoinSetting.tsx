import { useExchangeContext } from "../../exchange/context";

/**
 * Who the registration link works for.
 *
 * Shown beside the link on the confirmation screen, where the thought
 * first occurs, and again on the manage screen, because this is the
 * one setting an organizer changes their mind about: the link gets
 * passed around a family, or a stranger turns up, and the answer is
 * different a week in than it was on the first day.
 *
 * The label says what the checkbox does rather than what it is for.
 * Nobody here invites anybody: an open exchange means the link works
 * for whoever is holding it, which is a different and slightly
 * larger thing than passing an invitation on.
 */
export default function OpenJoinSetting() {
  const { allowOpenJoin, changeOpenJoin } = useExchangeContext();

  return (
    <div className="invite-setting">
      <label className="checkbox-inline">
        <input
          type="checkbox"
          checked={allowOpenJoin}
          onChange={(event) => void changeOpenJoin(event.target.checked)}
        />
        Let anyone with the link join
      </label>

      <p className="helper-text">
        {allowOpenJoin
          ? "Anyone with the registration link can join, so participants can pass it on."
          : "Only the people you list can join. Anyone else following the link is told it's invitation only."}
      </p>
    </div>
  );
}
