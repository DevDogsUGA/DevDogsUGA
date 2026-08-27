import Badge from "~/ui/badge";
import Callout from "~/ui/callout";
import type { LockReason } from "~/server/teams/lockState";

/**
 * Why a roster is closed, said in the terms that decide what to do next.
 *
 * The three reasons are not interchangeable and the UI has to distinguish
 * them, because only one of them is actionable:
 *
 *   * `entry` — the team's PR is open. Closing it reopens the roster, so this
 *     one gets an instruction rather than an apology.
 *   * `judging` — judging has started. Nothing reopens it; the offer to close
 *     the PR would be an affordance that no longer works.
 *   * `officer` — an officer locked it deliberately. The member cannot undo
 *     that and should be told who to ask rather than what to press.
 *
 * Showing one generic "this roster is locked" for all three is the failure
 * this component exists to prevent: it sends a team that could fix its own
 * problem to go find an officer.
 */

export const LOCK_COPY: Record<LockReason, { title: string; body: string }> = {
  entry: {
    title: "Your entry is open, so the roster is closed",
    body:
      "A team's pull request is its entry, and the roster locks while one is " +
      "open. To add somebody, close the pull request, add them, then reopen " +
      "it — nothing is lost by closing it.",
  },
  judging: {
    title: "Judging has started",
    body:
      "Rosters lock when judging begins and do not reopen. Everyone on the " +
      "team at that moment competed, and that is now permanent — closing the " +
      "pull request afterwards does not take it away.",
  },
  officer: {
    title: "An officer locked this roster",
    body:
      "This was done deliberately rather than by the usual rules. Ask an " +
      "officer if you think it should be reopened.",
  },
};

export default function LockNotice({
  reason,
  canUnlockByClosingPr,
}: {
  reason: LockReason;
  /**
   * Whether closing the PR would actually reopen it. Distinct from
   * `reason === "entry"` on purpose — once judging starts, the entry is still
   * the nearest reason but closing no longer helps, and offering the
   * instruction anyway is worse than saying nothing.
   */
  canUnlockByClosingPr?: boolean;
}) {
  const copy = LOCK_COPY[reason];

  return (
    <Callout
      tone="warning"
      title={copy.title}
      className="[&>p]:font-semibold"
      id={`lock-${reason}`}
    >
      {reason === "entry" && canUnlockByClosingPr === false
        ? LOCK_COPY.judging.body
        : copy.body}
    </Callout>
  );
}

/** The one-word version, for a list where a paragraph would not fit. */
export function LockChip({ reason }: { reason: LockReason | null }) {
  if (reason === null) return <Badge variant="success">Open</Badge>;

  const label =
    reason === "entry"
      ? "Entry open"
      : reason === "judging"
        ? "Judged"
        : "Locked";

  return (
    <Badge variant={reason === "judging" ? "default" : "warning"}>
      {label}
    </Badge>
  );
}
