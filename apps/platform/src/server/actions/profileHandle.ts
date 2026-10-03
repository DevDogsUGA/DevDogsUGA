"use server";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { profilePath, COMMUNITY_PATH } from "~/lib/profilePath";
import { db } from "~/server/db";
import { publicProfilesEnabled } from "~/server/features";
import { consumeRateLimit } from "~/server/rateLimit";
import { authenticate, expectSession } from "../auth";

export type SetHandleOutcome =
  /** Written. `handle` is what is now stored (lowercase). */
  | { status: "set"; handle: string }
  /** Someone else holds it, or took it between the options read and the write. Pick another. */
  | { status: "taken" }
  /** Not one of the member's current options. The list was stale or the request forged. */
  | { status: "not_offered" }
  /** Quarantined or suspended members cannot edit their profile. */
  | { status: "blocked" }
  | { status: "no_profile" }
  | { status: "rate_limited" };

/** Ten changes per ten minutes per member: retrying after "taken" is normal, scripted claiming is not. */
const SET_HANDLE_LIMIT = 10;
const SET_HANDLE_WINDOW_SECONDS = 10 * 60;

/**
 * Sets the signed-in member's public handle.
 *
 * All validation lives in `platform.set_handle`, which writes only a value that
 * is currently in the caller's `handle_options` with `available = true`, and
 * turns a unique-index race into `'taken'`. This action adds the session, a
 * rate limit, and cache invalidation; it deliberately does not duplicate the
 * format or availability rules. The handle is not writable by the browser at
 * all (no column grant), so this is the only path.
 */
export default async function setHandle(
  handle: string,
): Promise<SetHandleOutcome> {
  if (!publicProfilesEnabled()) throw new Error("Public profiles are off");
  const userId = await expectSession().catch(() =>
    authenticate("google", "/account"),
  );

  const allowed = await consumeRateLimit({
    scope: "profile:handle",
    subjectId: userId,
    limit: SET_HANDLE_LIMIT,
    windowSeconds: SET_HANDLE_WINDOW_SECONDS,
  });
  if (!allowed) return { status: "rate_limited" };

  const [before] = await db.execute<{ handle: string | null }>(
    sql`select handle from platform.profile where "userId" = ${userId}::uuid`,
  );
  const [row] = await db.execute<{ result: string }>(
    sql`select platform.set_handle(${userId}::uuid, ${handle}) as result`,
  );
  const result = row?.result;

  if (result === "set") {
    const stored = handle.trim().toLowerCase();
    revalidatePath(COMMUNITY_PATH);
    revalidatePath(profilePath(stored));
    if (before?.handle) revalidatePath(profilePath(before.handle));
    revalidatePath("/account");
    return { status: "set", handle: stored };
  }
  if (
    result === "taken" ||
    result === "not_offered" ||
    result === "blocked" ||
    result === "no_profile"
  ) {
    return { status: result };
  }
  throw new Error(`platform.set_handle returned ${String(result)}`);
}
