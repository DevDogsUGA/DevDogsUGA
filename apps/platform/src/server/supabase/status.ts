/**
 * Supabase's project status, mapped onto the platform's own lifecycle.
 *
 * Pure, and a total function over strings rather than over a union, because the
 * input comes from somebody else's API and can grow a value at any time.
 */

export type EnvStatus =
  | "provisioning"
  | "active"
  | "paused"
  | "restoring"
  | "detached"
  | "revoked"
  | "orphaned";

/**
 * Supabase publishes roughly fifteen project statuses; the platform has seven,
 * and three of those (`detached`, `revoked`, `orphaned`) are ours alone — they
 * describe the platform's relationship to a project, not the project's health,
 * so nothing upstream ever maps onto them.
 */
const MAPPING: Record<string, EnvStatus> = {
  ACTIVE_HEALTHY: "active",
  INACTIVE: "paused",
  COMING_UP: "restoring",
  RESTORING: "restoring",
  PAUSING: "active", // still serving; the pause takes ~80s to land
  RESTARTING: "restoring",
  UPGRADING: "restoring",
  RESIZING: "restoring",
  INIT_FAILED: "provisioning",
  UNKNOWN: "provisioning",
  GOING_DOWN: "restoring",
  RESTORE_FAILED: "paused",
  PAUSE_FAILED: "active",
  // Deliberately absent: REMOVED. A project Supabase says is gone is `orphaned`,
  // but ONLY the nightly reconcile may make that call -- see `isGone` below.
};

/**
 * Unrecognized statuses map to `provisioning`, which reads as "not ready yet".
 *
 * The alternative — mapping the unknown to `active` — would have the pre-warm
 * cron declare victory on a project that is not serving, and members would meet
 * a broken instance rather than a wait. Erring toward not-ready costs a retry;
 * erring toward ready costs an event.
 */
export function mapProjectStatus(
  upstream: string | null | undefined,
): EnvStatus {
  if (!upstream) return "provisioning";
  return MAPPING[upstream] ?? "provisioning";
}

/** Only `ACTIVE_HEALTHY` is a real readiness signal. */
export function isReady(upstream: string | null | undefined): boolean {
  return upstream === "ACTIVE_HEALTHY";
}

/**
 * Has the project genuinely disappeared?
 *
 * Separate from the mapping on purpose. Orphaning tears down credentials and
 * deletes Vault secrets, so it must follow from a definite answer — a 404 from
 * `GET /v1/projects/{ref}`, or absence from `GET /v1/projects` — and never from
 * a transient error. The proxy must not make this determination at all.
 */
export function isGone(upstream: string | null | undefined): boolean {
  return upstream === "REMOVED";
}
