import type { ActionResult } from "~/lib/actionResult";

/** The words under a refresh button once the request has been answered. */
export function refreshOutcome(
  data:
    { status: "queued" | "cached"; lastSyncedAt: string | null } | undefined,
): string {
  if (!data) return "";
  const when = data.lastSyncedAt
    ? ` Last synced ${new Date(data.lastSyncedAt).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" })} Eastern.`
    : "";
  return data.status === "queued"
    ? `Refresh started; new commits appear shortly.${when}`
    : `Commits are up to date.${when}`;
}

/** A failed field error for the repo box, or null when the failure is not about it. */
export function addRepoField(
  result: ActionResult<unknown> | null,
): string | null {
  if (!result || result.ok) return null;
  return result.fieldErrors?.repo ?? result.fieldErrors?.repos ?? null;
}
