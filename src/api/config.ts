/**
 * Where the database is, and the key to knock with.
 *
 * Both are build-time values: Vite replaces them at build, so they are
 * baked into the bundle. That is correct for these two and
 * only these two. The secret key is never named here, in the deploy
 * workflow, or anywhere a browser can reach.
 */

import { createRpc, type RpcCaller } from "./rpc";

declare const __SUPABASE_URL__: string | undefined;
declare const __SUPABASE_ANON_KEY__: string | undefined;

// typeof rather than a direct read: the render tests import these
// modules into Node, where Vite has replaced nothing and the constants
// simply do not exist.
const url =
  typeof __SUPABASE_URL__ === "undefined" ? "" : __SUPABASE_URL__;
const key =
  typeof __SUPABASE_ANON_KEY__ === "undefined" ? "" : __SUPABASE_ANON_KEY__;

/**
 * False when the app was built without the two values. The app still
 * runs: an exchange lives in the browser that made it, the way it did
 * before there was a database. Saying so is better than failing at the
 * first click with something about fetch.
 */
export const hasDatabase = Boolean(url && key);

export const rpc: RpcCaller = hasDatabase
  ? createRpc({ url: url as string, key: key as string })
  : () => {
      throw new Error(
        "This build has no database configured, so nothing can be saved."
      );
    };
