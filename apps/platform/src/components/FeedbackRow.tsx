import Link from "next/link";
import type { FeedbackListItem } from "~/server/actions/feedback";
import FeedbackStatusSelect, {
  type FeedbackStatus,
} from "~/components/FeedbackStatusSelect";

function formatLabel(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const SEVERITY_CLASSES: Record<string, string> = {
  low: "bg-white/10 text-mauve-300",
  medium: "bg-amber-500/10 text-amber-300",
  high: "bg-rose-500/10 text-rose-300",
};

function Chip({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`rounded-sm px-2 py-0.5 text-xs ${className || "bg-white/10 text-mauve-300"}`}
    >
      {children}
    </span>
  );
}

interface Props {
  item: FeedbackListItem;
  /** If provided, the row's main content links to a detail page (admin). */
  href?: string;
  updateStatus: (feedbackId: string, status: FeedbackStatus) => Promise<void>;
}

export default function FeedbackRow({ item, href, updateStatus }: Props) {
  const main = (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip>{formatLabel(item.type)}</Chip>
        {item.severity && (
          <Chip className={SEVERITY_CLASSES[item.severity]}>
            {formatLabel(item.severity)}
          </Chip>
        )}
        {item.topicLabel && <Chip>{item.topicLabel}</Chip>}
      </div>
      <span className="truncate font-medium text-white/90">{item.title}</span>
      <p className="line-clamp-2 text-sm text-mauve-400">{item.description}</p>
      <span className="text-xs text-mauve-500">
        {item.submitterName} · {new Date(item.createdAt).toLocaleDateString()}
      </span>
    </div>
  );

  return (
    <li className="flex items-start justify-between gap-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3 transition-colors hover:border-white/20 hover:bg-white/10">
      {href ? (
        <Link href={href} className="min-w-0 flex-1">
          {main}
        </Link>
      ) : (
        <div className="min-w-0 flex-1">{main}</div>
      )}

      <FeedbackStatusSelect
        feedbackId={item.id}
        status={item.status as FeedbackStatus}
        updateStatus={updateStatus}
      />
    </li>
  );
}
