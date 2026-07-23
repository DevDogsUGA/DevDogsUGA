"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ConsoleCard } from "~/ui/card";
import FeedbackRow from "~/components/FeedbackRow";
import { updateFeedbackStatus } from "~/server/actions/feedback";
import type {
  FeedbackFilters,
  FeedbackListItem,
} from "~/server/actions/feedback";

const SELECT_CLASS =
  "rounded-sm border border-mauve-600 bg-mauve-800 px-2 py-1.5 text-sm text-white outline-none focus:border-white";

const TEXT_INPUT_CLASS =
  "rounded-sm border border-mauve-600 bg-mauve-800 px-2 py-1.5 text-sm text-white outline-none placeholder:text-mauve-500 focus:border-white";

const TYPE_OPTIONS = [
  { value: "", label: "All Types" },
  { value: "bug_report", label: "Bug Report" },
  { value: "feature_request", label: "Feature Request" },
  { value: "design_feedback", label: "Design Feedback" },
  { value: "performance", label: "Performance" },
  { value: "content_issue", label: "Content Issue" },
  { value: "other", label: "Other" },
];

const SEVERITY_OPTIONS = [
  { value: "", label: "All Severities" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

interface Props {
  items: FeedbackListItem[];
  filters: FeedbackFilters;
}

export default function FeedbackField({ items, filters }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function buildHref(overrides: Record<string, string | undefined>): string {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(overrides)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const query = next.toString();
    return query ? `${pathname}?${query}` : pathname;
  }

  function updateParam(key: string, value: string) {
    router.push(buildHref({ [key]: value || undefined }));
  }

  return (
    <ConsoleCard.Root>
      <ConsoleCard.Header
        title={filters.tab === "archive" ? "Archive" : "Inbox"}
      >
        <div className="flex gap-2 text-sm">
          <Link
            href={buildHref({ tab: undefined })}
            className={`rounded-sm px-2 py-1 transition-colors ${
              filters.tab !== "archive"
                ? "bg-white/10 text-white"
                : "text-mauve-400 hover:text-white"
            }`}
          >
            Inbox
          </Link>
          <Link
            href={buildHref({ tab: "archive" })}
            className={`rounded-sm px-2 py-1 transition-colors ${
              filters.tab === "archive"
                ? "bg-white/10 text-white"
                : "text-mauve-400 hover:text-white"
            }`}
          >
            Archive
          </Link>
        </div>
      </ConsoleCard.Header>
      <ConsoleCard.Content>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={filters.type ?? ""}
            onChange={(e) => updateParam("type", e.target.value)}
            className={SELECT_CLASS}
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            value={filters.severity ?? ""}
            onChange={(e) => updateParam("severity", e.target.value)}
            className={SELECT_CLASS}
          >
            {SEVERITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Search title or description"
            defaultValue={filters.search ?? ""}
            onKeyDown={(e) => {
              if (e.key === "Enter")
                updateParam("search", e.currentTarget.value);
            }}
            onBlur={(e) => updateParam("search", e.target.value)}
            className={`${TEXT_INPUT_CLASS} min-w-48 flex-1`}
          />
        </div>

        <div>
          {items.length === 0 ? (
            <p className="text-sm text-mauve-400">
              No {filters.tab === "archive" ? "archived" : "open"} feedback to
              show.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {items.map((item) => (
                <FeedbackRow
                  key={item.id}
                  item={item}
                  href={`/console/feedback/${item.id}`}
                  updateStatus={updateFeedbackStatus}
                />
              ))}
            </ul>
          )}
        </div>
      </ConsoleCard.Content>
    </ConsoleCard.Root>
  );
}
