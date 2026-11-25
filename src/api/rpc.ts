/**
 * Talking to the database.
 *
 * Every table denies the browser outright, so the entire API is the
 * SECURITY DEFINER functions in supabase/migrations: POST a JSON body
 * to /rest/v1/rpc/<name> with two headers. That is small enough that a
 * client library would be a dependency, a bundle, and a version to keep
 * up with, in exchange for something fetch already does.
 *
 * The publishable key is public by design. It is in this bundle, and on
 * its own it can reach nothing: every function demands a token it does
 * not have.
 */

export type RpcErrorShape = {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
};

/** A call that reached the database and was refused, or never arrived. */
export class RpcError extends Error {
  /** HTTP status, or 0 when the request never completed. */
  readonly status: number;
  /** Postgres SQLSTATE, when the database is what refused. */
  readonly code?: string;
  readonly hint?: string;

  constructor(
    message: string,
    status: number,
    body?: RpcErrorShape
  ) {
    super(message);
    this.name = "RpcError";
    this.status = status;
    this.code = body?.code;
    this.hint = body?.hint;
  }

  /** Nothing answered: offline, or a paused project. */
  get unreachable() {
    return this.status === 0;
  }
}

export type RpcCaller = <T>(
  name: string,
  args?: Record<string, unknown>
) => Promise<T>;

/**
 * Built rather than imported, so a test can hand it a fetch that
 * answers from memory and the whole thing is checkable without a
 * network or a browser.
 */
export function createRpc(config: {
  url: string;
  key: string;
  fetchImpl?: typeof fetch;
}): RpcCaller {
  const base = config.url.replace(/\/+$/, "");
  const call = config.fetchImpl ?? fetch;

  return async function rpc<T>(
    name: string,
    args: Record<string, unknown> = {}
  ): Promise<T> {
    let response: Response;

    try {
      response = await call(`${base}/rest/v1/rpc/${name}`, {
        method: "POST",
        headers: {
          apikey: config.key,
          Authorization: `Bearer ${config.key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(args),
      });
    } catch (cause) {
      // Offline, DNS, CORS, or a project that has been paused and is
      // answering nothing at all.
      throw new RpcError(
        "Couldn't reach the exchange. Check your connection and try again.",
        0,
        { message: String(cause) }
      );
    }

    const text = await response.text();
    const body = text ? safeJson(text) : null;

    if (!response.ok) {
      const shape = (body ?? {}) as RpcErrorShape;

      throw new RpcError(
        shape.message || `The exchange refused that (${response.status}).`,
        response.status,
        shape
      );
    }

    return body as T;
  };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}
