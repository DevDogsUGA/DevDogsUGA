"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ConsoleCard } from "~/ui/card";
import type { AuditLogPageData } from "~/server/loaders/auditLog";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-300",
  resolved: "bg-emerald-500/10 text-emerald-300",
  dismissed: "bg-white/5 text-mauve-400",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`shrink-0 rounded-sm px-2 py-0.5 text-xs capitalize ${STATUS_COLORS[status] ?? "bg-white/5 text-mauve-400"}`}
    >
      {status}
    </span>
  );
}

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
    <ConsoleCard.Root>
      <ConsoleCard.Header title="Production Report Events">
        <p className="mt-1 pb-4 text-sm text-mauve-400">
          {totalCount} total event{totalCount !== 1 ? "s" : ""} across all
          production clients
        </p>
      </ConsoleCard.Header>
      <ConsoleCard.Content>
        <div>
          {entries.length === 0 ? (
            <p className="text-sm text-mauve-400">No production reports yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {entries.map((entry) => (
                <li key={entry.id}>
                  <div className="flex items-start justify-between gap-4 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate font-mono text-xs text-white/80">
                        {entry.contentTypeLabel ? `${entry.contentTypeLabel}: ` : ""}
                        {entry.contentId}
                      </span>
                      <span className="text-xs text-mauve-400">
                        {entry.clientOwnerName}
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
                    </div>
                    <StatusBadge status={entry.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-mauve-400">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={buildPageHref(page - 1)}
                className="rounded-lg border border-mauve-600 bg-mauve-800 px-3 py-1 text-sm font-medium text-white transition-colors hover:border-white"
              >
                ← Prev
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={buildPageHref(page + 1)}
                className="rounded-lg border border-mauve-600 bg-mauve-800 px-3 py-1 text-sm font-medium text-white transition-colors hover:border-white"
              >
                Next →
              </Link>
            )}
          </div>
        </div>
      </ConsoleCard.Content>
    </ConsoleCard.Root>
  );
}
