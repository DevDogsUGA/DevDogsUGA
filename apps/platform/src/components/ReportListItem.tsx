import Link from "next/link";

interface ReportListItemProps {
  id: string;
  contentId: string;
  contentTypeLabel?: string | null;
  reasonTitle?: string | null;
  status: string;
  createdAt: string | Date;
  corroborationCount?: number;
  clientName?: string;
  variant?: "default" | "compact";
}

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
      className={`shadow-block-sm flex items-center justify-between border border-black bg-white text-sm transition-[translate,box-shadow] hover:-translate-x-0.5 hover:-translate-y-0.5 ${
        isCompact ? "px-4 py-2.5 text-mauve-500 hover:text-mauve-800" : "px-4 py-3"
      }`}
    >
      <div className="flex flex-col gap-0.5">
        <span className="font-mono text-xs text-mauve-700">
          {contentTypeLabel ? `${contentTypeLabel}: ` : ""}
          {contentId}
        </span>
        {!isCompact && (
          <span className="text-xs text-mauve-500">
            {clientName ? `${clientName} · ` : ""}
            {reasonTitle ?? "Unknown reason"} · {date}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {corroborationCount > 0 && !isCompact && (
          <span className="rounded-sm bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
            +{corroborationCount} corroboration
            {corroborationCount !== 1 ? "s" : ""}
          </span>
        )}
        {isCompact ? (
          <span className="capitalize">{status}</span>
        ) : (
          <span className="text-mauve-400">&rarr;</span>
        )}
      </div>
    </Link>
  );
}
