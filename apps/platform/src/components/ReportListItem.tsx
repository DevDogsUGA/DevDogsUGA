import Link from "next/link";
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
  const date = new Date(createdAt).toLocaleDateString();
  const isCompact = variant === "compact";

  return (
    <Link
      href={`/console/moderation/${id}`}
      className={`flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-white/5 text-sm transition-colors outline-none hover:border-white/25 hover:bg-white/[0.07] focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1 focus-visible:ring-offset-mauve-950 ${
        isCompact ? "px-4 py-2.5" : "px-4 py-3"
      }`}
    >
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate font-mono text-xs text-white/80">
          {contentTypeLabel ? `${contentTypeLabel}: ` : ""}
          {contentId}
        </span>
        {!isCompact && (
          <span className="text-xs text-mauve-400">
            {clientName ? `${clientName} · ` : ""}
            {reasonTitle ?? "Unknown reason"} · {date}
          </span>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <CorroborationBadge count={isCompact ? 0 : corroborationCount} />
        <ReportStatusBadge status={status} />
      </span>
    </Link>
  );
}
