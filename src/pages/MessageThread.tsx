import { useEffect, useRef, useState } from "react";
import { formatMessageTime } from "../exchange/format";
import type { Thread, ThreadRole } from "../exchange/registration";

const MAX_LENGTH = 1000;

/**
 * One side of one conversation.
 *
 * Rendered twice on a page: once as the giver, writing to somebody
 * whose name they know, and once as the receiver, writing back to
 * whoever drew them. The only difference between the two is what the
 * other person is called, which my_thread has already decided, so
 * this component never needs to know which role it is showing except
 * to label its own fields.
 */
export default function MessageThread({
  as,
  thread,
  busy,
  onSend,
  onRead,
}: {
  as: ThreadRole;
  thread?: Thread;
  busy?: boolean;
  onSend: (body: string) => void;
  onRead: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [sent, setSent] = useState(0);

  const theirs = thread?.messages.filter((m) => m.from === "them").length ?? 0;

  /*
   * Reading is what stops the next reminder, so it is reported when
   * there is something of theirs on screen and again whenever that
   * count changes. Not on every render: the call is a write.
   */
  const reported = useRef(-1);

  useEffect(() => {
    if (!thread?.available || theirs === 0) return;
    if (reported.current === theirs) return;

    reported.current = theirs;
    onRead();
  }, [thread?.available, theirs, onRead]);

  if (!thread?.available) return null;

  const them = thread.withLabel ?? "Your Giver";
  const named = as === "giver";
  const canSend = thread.canSend ?? true;

  const trimmed = draft.trim();

  const send = () => {
    if (!trimmed || busy) return;

    onSend(trimmed);
    setDraft("");
    setSent((n) => n + 1);
  };

  return (
    <section className="thread">
      <h3>{named ? `Messages with ${them}` : "Messages with your giver"}</h3>

      <p className="helper-text">
        {named
          ? `${them} doesn't know it's you, and nothing you send here changes that.`
          : "Whoever drew you can read this. You won't find out who they are."}
      </p>

      {thread.messages.length === 0 ? (
        <p className="register-empty">
          {named
            ? "No messages yet. Ask a question if you're stuck for ideas."
            : "No messages yet. Say hello, or add something to your wishlist in words."}
        </p>
      ) : (
        <ol className="thread-messages">
          {thread.messages.map((message) => (
            <li key={message.id} className={`thread-${message.from}`}>
              <p className="thread-who">
                {message.fromLabel}
                <span className="thread-when">
                  {formatMessageTime(message.at)}
                </span>
              </p>
              <p className="thread-body">{message.body}</p>
            </li>
          ))}
        </ol>
      )}

      {canSend ? (
        <>
          <div className="register-field thread-compose">
            <label htmlFor={`thread-${as}`}>
              {named ? `Write to ${them}` : "Write to your giver"}
            </label>
            <textarea
              id={`thread-${as}`}
              value={draft}
              maxLength={MAX_LENGTH}
              rows={3}
              placeholder={
                named
                  ? "Any hints about sizes, colors, or things to avoid?"
                  : "Anything you'd like them to know?"
              }
              onChange={(event) => setDraft(event.target.value)}
            />
          </div>

          <div className="thread-send">
            <button type="button" onClick={send} disabled={!trimmed || busy}>
              {busy ? "Sending..." : "Send"}
            </button>
            {sent > 0 && !busy && (
              <span className="register-saved" role="status">
                Sent
              </span>
            )}
          </div>
        </>
      ) : (
        /*
         * The organizer can switch messaging off for everybody. When
         * they have, the thread stays readable and the composer goes:
         * better than a Send button that fails on the far side of a
         * message somebody has already typed out.
         */
        <p className="register-empty">
          Messages are switched off for this exchange. Anything already
          here stays where it is.
        </p>
      )}
    </section>
  );
}
