import { ClockIcon } from "@phosphor-icons/react/ssr";
import { formatEventDateTime } from "~/lib/eventTime";
import { cn } from "~/lib/cn";

/**
 * The preview's mark on anything that is not live yet: "Scheduled · Oct 5,
 * 2026, 6:00 PM". Only `/preview/docs` ever has one to draw, because the
 * public docs do not contain a page that is still ahead of its time.
 *
 * The time is formatted in the club's zone, on the server or in the browser
 * alike, so the markup matches on hydration.
 */
export default function DocsScheduled({
  at,
  className,
}: {
  /** UTC ISO. */
  at: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium text-amber-300",
        className,
      )}
    >
      <ClockIcon aria-hidden className="size-3 shrink-0" />
      Scheduled · {formatEventDateTime(at)}
    </span>
  );
}
