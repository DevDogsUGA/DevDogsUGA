import Badge from "~/ui/badge";

/**
 * One vocabulary for report and member status, in one place.
 *
 * These were declared three times over: `red/orange/mauve` on the two
 * moderation pages, `amber/emerald/white` in the audit log, and
 * `yellow/green/mauve` in the report history, so the same resolved report was
 * green in one list and emerald in another. Anything not in a map falls through
 * to the neutral variant rather than throwing, because these strings come from
 * the database and a new one should look plain, not crash the page.
 */

const REPORT_STATUS = {
  open: "warning",
  pending: "warning",
  resolved: "success",
  dismissed: "default",
  quarantined: "danger",
} as const;

export function ReportStatusBadge({ status }: { status: string }) {
  const variant =
    REPORT_STATUS[status as keyof typeof REPORT_STATUS] ?? "default";
  return (
    <Badge variant={variant} className="shrink-0 capitalize">
      {status}
    </Badge>
  );
}

export type Standing = "banned" | "suspended" | "member";

/** What a member currently is, said the same way wherever it is said. */
export function StandingBadge({
  standing,
  detail,
}: {
  standing: Standing;
  /** A suspension's reason, shown beside the badge rather than inside it. */
  detail?: string | null;
}) {
  const variant =
    standing === "banned"
      ? "danger"
      : standing === "suspended"
        ? "warning"
        : "default";

  return (
    <span className="flex flex-wrap items-center gap-2">
      <Badge variant={variant} className="capitalize">
        {standing}
      </Badge>
      {detail && <span className="text-xs text-mauve-400">{detail}</span>}
    </span>
  );
}

/** The standing implied by the two flags every moderation loader returns. */
export function standingOf(isBanned: boolean, suspension: unknown): Standing {
  return isBanned ? "banned" : suspension ? "suspended" : "member";
}

/** "+2 corroborations", or nothing at all when there are none. */
export function CorroborationBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <Badge variant="warning" className="shrink-0">
      +{count} corroboration{count !== 1 ? "s" : ""}
    </Badge>
  );
}
