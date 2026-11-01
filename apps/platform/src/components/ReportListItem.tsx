import Link from "next/link";
import { formatEventDate } from "~/lib/eventTime";
import { CaretRightIcon } from "@phosphor-icons/react/ssr";
import {
  CorroborationBadge,
  ReportStatusBadge,
} from "~/components/StatusBadges";

interface ReportListItemProps {
  id: string;
  contentId: string;
  contentTypeLabel?: string | null;
  reasonTitle?: string | null;
  status: string;
  createdAt: string | Date;
  corroborationCount?: number;
  clientName?: string;
  /** `compact` drops the second line, for a list that is context rather than work. */
  variant?: "default" | "compact";
}

/**
 * One report, as a row in any list of them.
 *
 * Written to be shared and then never imported: the dashboard, the report
 * history, and the audit log each grew their own row instead, which is why the
 * same report could read three different ways. All three now come through
 * here.
 */
export default function ReportListItem({
  id,
  contentId,
  contentTypeLabel,
  reasonTitle,
  status,
  createdAt,
  corroborationCount = 0,
  clientName,
  variant = "default",
}: ReportListItemProps) {
  const date = formatEventDate(createdAt);
  const isCompact = variant === "compact";

  return (
    <Link
      href={`/dashboard/moderation/${id}`}
      className={`con-report ${isCompact ? "compact" : ""}`}
    >
      <span className="con-report-main">
        <b>
          {contentTypeLabel ? `${contentTypeLabel}: ` : ""}
          {contentId}
        </b>
        {!isCompact && (
          <small>
            {clientName ? `${clientName} · ` : ""}
            {reasonTitle ?? "Unknown reason"} · {date}
          </small>
        )}
      </span>
      <span className="con-report-end">
        <CorroborationBadge count={isCompact ? 0 : corroborationCount} />
        <ReportStatusBadge status={status} />
        <CaretRightIcon weight="bold" aria-hidden className="go" />
      </span>
    </Link>
  );
}
