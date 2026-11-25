import { useExchangeContext } from "../../exchange/context";

/**
 * Whether the two ends of an assignment may write to each other.
 *
 * Off for the whole exchange or not at all. A per-person switch would
 * be a way of singling somebody out, and the organizer is the one
 * person who can see every pairing: letting them mute one thread
 * would let them act on what only they know.
 *
 * It can be set before the draw as well as after. Nobody can write
 * anything until there are assignments to write along, but an
 * organizer deciding in advance that this exchange is not having
 * messages should not have to wait for the draw to say so.
 */
export default function MessagingSetting() {
  const { messagingEnabled, changeMessagingEnabled } =
    useExchangeContext();

  return (
    <div className="invite-setting">
      <label className="checkbox-inline">
        <input
          type="checkbox"
          checked={messagingEnabled}
          onChange={(event) =>
            void changeMessagingEnabled(event.target.checked)
          }
        />
        Let people message anonymously after the draw
      </label>

      <p className="helper-text">
        {messagingEnabled
          ? "Each person can write to whoever they drew, and to whoever drew them. Nobody learns who their own giver is."
          : "Messaging is off for everyone. Anything already sent stays readable, but nobody can write anything new."}
      </p>
    </div>
  );
}
