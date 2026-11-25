/**
 * The state behind a registration link.
 *
 * One hook for both screens an invitee sees, because they are two
 * views of one thing: before you join, the exchange is a preview; once
 * you have, it is your own page. Which one shows depends on whether
 * this browser holds a token that still works, and that is a question
 * only the server can answer.
 *
 * Nothing here reads the organizer's exchange. It used to, which is
 * why a registration link only ever opened in the browser that made
 * the exchange.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { hasDatabase } from "../api/config.js";
import { RpcError } from "../api/rpc.js";
import type { RestrictionDirection } from "./types.js";
import {
  clearRestrictionRemotely,
  fetchRegistration,
  forgetInvitee,
  joinExchange,
  previewExchange,
  rememberInvitee,
  rememberedInvitee,
  saveRegistration,
  setRemindersRemotely,
  setRestrictionRemotely,
  withdrawRemotely,
} from "./registration.js";
import type {
  ExchangePreview,
  RegistrationView,
} from "./registration.js";

export type RegistrationState =
  /** Asking the server, on first paint and after a retry. */
  | { kind: "loading" }
  /**
   * The app was built without a database to talk to. A deployment
   * problem rather than anything the reader did, so it says so plainly
   * instead of blaming their link.
   */
  | { kind: "no-database" }
  /** The server answered, and has no exchange with this code. */
  | { kind: "missing" }
  /** Nothing answered: offline, or the project is asleep. */
  | { kind: "unreachable" }
  /** Not registered yet: show them what this is and the form. */
  | { kind: "join"; preview: ExchangePreview }
  /** Registered, with a token this browser still holds. */
  | { kind: "registered"; view: RegistrationView };

export type JoinFields = {
  name: string;
  email: string;
  wishlist: string;
  preferences: string;
};

export type SaveFields = {
  name: string;
  wishlist: string;
  preferences: string;
};

/** SQLSTATE for "select ... into" finding nothing; our "no such thing". */
const NOT_FOUND = "P0002";

export function useRegistration(eventCode: string) {
  /*
   * Results are stored with the code they belong to, and "loading" is
   * worked out rather than stored. Two things fall out of that: an
   * answer for the previous link can never paint over the new one, and
   * nothing has to set a loading state on the way in, which is what an
   * effect must not do.
   */
  const [loaded, setLoaded] = useState<{
    code: string;
    state: RegistrationState;
  } | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const state: RegistrationState =
    !hasDatabase
      ? { kind: "no-database" }
      : loaded && loaded.code === eventCode
      ? loaded.state
      : { kind: "loading" };

  /*
   * Two answers for the same code can still arrive out of order, after
   * a retry. Only the most recent request may write.
   */
  const run = useRef(0);

  const settle = useCallback(
    (ticket: number, code: string, next: RegistrationState) => {
      if (ticket !== run.current) return;

      setLoaded({ code, state: next });
    },
    []
  );

  const load = useCallback(async () => {
    if (!hasDatabase) {
      return;
    }

    const ticket = ++run.current;

    const token = rememberedInvitee(eventCode);

    if (token) {
      try {
        const view = await fetchRegistration(token);

        settle(ticket, eventCode, { kind: "registered", view });
        return;
      } catch (caught) {
        /*
         * The token is no longer good: they withdrew on another
         * device, or the organizer removed them. Drop it and show the
         * exchange as if they had just arrived, rather than an error
         * about a link they never typed.
         */
        if (caught instanceof RpcError && !caught.unreachable) {
          forgetInvitee(eventCode);
        } else {
          settle(ticket, eventCode, { kind: "unreachable" });
          return;
        }
      }
    }

    try {
      const preview = await previewExchange(eventCode);

      settle(ticket, eventCode, { kind: "join", preview });
    } catch (caught) {
      settle(
        ticket,
        eventCode,
        caught instanceof RpcError && caught.unreachable
          ? { kind: "unreachable" }
          : { kind: "missing" }
      );
    }
  }, [eventCode, settle]);

  useEffect(() => {
    void load();
  }, [load]);

  /*
   * Asking again after a failure. Separate from load so that clearing
   * the last error happens here, in response to the click, rather than
   * inside an effect.
   */
  const retry = useCallback(() => {
    setError(null);
    setLoaded(null);
    void load();
  }, [load]);

  /** Wraps an action so one of them cannot run twice at once. */
  const act = useCallback(
    async (run: () => Promise<void>) => {
      setBusy(true);
      setError(null);

      try {
        await run();
      } catch (caught) {
        setError(messageFor(caught));
      } finally {
        setBusy(false);
      }
    },
    []
  );

  const join = useCallback(
    (fields: JoinFields) =>
      act(async () => {
        const result = await joinExchange({ eventCode, ...fields });

        rememberInvitee(eventCode, result.inviteeToken);
        setLoaded({
          code: eventCode,
          state: { kind: "registered", view: result.registration },
        });
      }),
    [act, eventCode]
  );

  const save = useCallback(
    (fields: SaveFields) =>
      act(async () => {
        const token = rememberedInvitee(eventCode);

        if (!token) throw new Error(LOST_TOKEN);

        setLoaded({
          code: eventCode,
          state: {
            kind: "registered",
            view: await saveRegistration({ inviteeToken: token, ...fields }),
          },
        });
      }),
    [act, eventCode]
  );

  const toggleRestriction = useCallback(
    (otherId: string, direction: RestrictionDirection, on: boolean) =>
      act(async () => {
        const token = rememberedInvitee(eventCode);

        if (!token) throw new Error(LOST_TOKEN);

        const view = on
          ? await setRestrictionRemotely(token, otherId, direction)
          : await clearRestrictionRemotely(token, otherId, direction);

        setLoaded({ code: eventCode, state: { kind: "registered", view } });
      }),
    [act, eventCode]
  );

  const setReminders = useCallback(
    (wanted: boolean) =>
      act(async () => {
        const token = rememberedInvitee(eventCode);

        if (!token) throw new Error(LOST_TOKEN);

        setLoaded({
          code: eventCode,
          state: {
            kind: "registered",
            view: await setRemindersRemotely(token, wanted),
          },
        });
      }),
    [act, eventCode]
  );

  const withdraw = useCallback(
    () =>
      act(async () => {
        const token = rememberedInvitee(eventCode);

        if (!token) throw new Error(LOST_TOKEN);

        await withdrawRemotely(token);
        forgetInvitee(eventCode);
        setLoaded(null);

        // Back to the preview, which is what somebody who has not
        // registered sees. Reloaded rather than reused: withdrawing
        // may have been the last registration, and the deadline may
        // have passed while they were deciding.
        await load();
      }),
    [act, eventCode, load]
  );

  return {
    state,
    busy,
    error,
    clearError: () => setError(null),
    retry,
    join,
    save,
    toggleRestriction,
    setReminders,
    withdraw,
  };
}

const LOST_TOKEN =
  "This browser no longer has your registration. Open your link again to pick up where you left off.";

/**
 * What to put on screen when a call fails.
 *
 * The database raises sentences meant to be read by the person who hit
 * the problem ("Registration has closed for this exchange"), so they
 * are passed through rather than replaced with something vaguer. Only
 * the case where nothing answered needs wording of its own, because
 * there is no message to pass on.
 */
function messageFor(caught: unknown): string {
  if (caught instanceof RpcError) {
    if (caught.unreachable) {
      return "Couldn't reach Mystery Name Draw just now. Check your connection and try again.";
    }

    if (caught.code === NOT_FOUND) {
      return "That exchange couldn't be found. Check the link and try again.";
    }

    return caught.message;
  }

  return caught instanceof Error
    ? caught.message
    : "Something went wrong. Please try again.";
}
