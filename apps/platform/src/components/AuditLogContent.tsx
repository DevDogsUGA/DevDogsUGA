"use client";

import { useSearchParams } from "next/navigation";
import { ConsoleCard } from "~/ui/card";
import Pagination from "~/ui/pagination";
import { ReportStatusBadge } from "~/components/StatusBadges";
import type { AuditLogPageData } from "~/server/loaders/auditLog";

export default function AuditLogContent({
  entries,
  page,
  totalCount,
  pageSize,
}: AuditLogPageData) {
  const params = useSearchParams();
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  function buildPageHref(p: number) {
    const next = new URLSearchParams(params.toString());
    next.set("page", String(p));
    return `/console/audit-log?${next.toString()}`;
  }

  return (
    <ConsoleCard.Root id="production-report-events">
      <ConsoleCard.Header
        title="Production Report Events"
        description={`${totalCount} total event${totalCount !== 1 ? "s" : ""} across all production clients`}
      />
      <ConsoleCard.Content>
        <div>
          {entries.length === 0 ? (
            <p className="text-sm text-mauve-400">No production reports yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {entries.map((entry) => (
                <li key={entry.id}>
                  {/*
                    Deliberately not `ReportListItem`, which every other list of
                    reports now uses. This one carries a resolution date the
                    shared row has no place for, and dropping it would lose the
                    only thing the audit log says that the report itself does
                    not. The classes below are that row's, minus its link — an
                    entry here is a record, not somewhere to go.
                  */}
                  <div className="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm">
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate font-mono text-xs text-white/80">
                        {entry.contentType}: {entry.contentRef}
                      </span>
                      <span className="text-xs text-mauve-400">
                        {entry.appName}
                        {" · "}
                        {entry.reasonTitle ?? "Unknown reason"}
                        {" · "}
                        {new Date(entry.createdAt).toLocaleDateString()}
                        {entry.resolvedAt && (
                          <>
                            {" "}
                            · resolved{" "}
                            {new Date(entry.resolvedAt).toLocaleDateString()}
                          </>
                        )}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <ReportStatusBadge status={entry.status} />
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
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
