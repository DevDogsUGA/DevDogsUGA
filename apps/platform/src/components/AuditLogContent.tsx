"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AUDIT_SOURCES } from "~/lib/audit";
import type { AuditLogPageData } from "~/server/loaders/auditLog";
import { ConsoleCard } from "~/ui/card";
import Pagination from "~/ui/pagination";

function humanize(value: string): string {
  return value.replaceAll("_", " ").replaceAll(".", " · ");
}

export default function AuditLogContent({
  entries,
  filters,
  page,
  totalCount,
  pageSize,
}: AuditLogPageData) {
  const params = useSearchParams();
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  function buildPageHref(nextPage: number) {
    const next = new URLSearchParams(params.toString());
    next.set("page", String(nextPage));
    return `/console/audit-log?${next.toString()}`;
  }

  return (
    <ConsoleCard.Root id="audit-events">
      <ConsoleCard.Header
        title="Audit events"
        description={`${totalCount} matching event${totalCount === 1 ? "" : "s"}`}
      />
      <ConsoleCard.Content>
        <form className="mb-5 grid gap-3 sm:grid-cols-4" method="get">
          <label className="flex flex-col gap-1 text-xs text-mauve-300">
            Source
            <select
              className="rounded-md border border-white/10 bg-mauve-950 px-3 py-2 text-sm text-white"
              defaultValue={filters.source ?? ""}
              name="source"
            >
              <option value="">All sources</option>
              {AUDIT_SOURCES.map((source) => (
                <option key={source} value={source}>
                  {humanize(source)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-mauve-300">
            Action
            <input
              className="rounded-md border border-white/10 bg-mauve-950 px-3 py-2 text-sm text-white"
              defaultValue={filters.action}
              name="action"
              placeholder="attendance.recorded"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-mauve-300">
            Target type
            <input
              className="rounded-md border border-white/10 bg-mauve-950 px-3 py-2 text-sm text-white"
              defaultValue={filters.targetType}
              name="targetType"
              placeholder="attendance"
            />
          </label>
          <button
            className="self-end rounded-md bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/15"
            type="submit"
          >
            Filter
          </button>
        </form>

        {entries.length === 0 ? (
          <p className="text-sm text-mauve-400">No matching audit events.</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      className="font-medium text-white hover:underline"
                      href={`/console/audit-log/${entry.id}`}
                    >
                      {humanize(entry.action)}
                    </Link>
                    <p className="truncate font-mono text-xs text-mauve-300">
                      {entry.targetType}: {entry.targetId}
                    </p>
                  </div>
                  <span className="rounded-full border border-white/10 px-2 py-1 text-xs text-mauve-200">
                    {humanize(entry.source)}
                  </span>
                </div>
                <p className="mt-2 text-xs text-mauve-400">
                  {entry.actor} · {new Date(entry.createdAt).toLocaleString()}
                </p>
              </li>
            ))}
          </ol>
        )}

        <Pagination
          page={page}
          totalPages={totalPages}
          buildHref={buildPageHref}
          label="events"
          totalCount={totalCount}
        />
      </ConsoleCard.Content>
    </ConsoleCard.Root>
  );
}
