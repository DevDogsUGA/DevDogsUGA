"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AUDIT_SOURCES } from "~/lib/audit";
import { formatEventDateTime } from "~/lib/eventTime";
import type { AuditLogPageData } from "~/server/loaders/auditLog";
import { Panel } from "~/ui/app-shell";
import Badge from "~/ui/badge";
import { Button } from "~/ui/button";
import { EmptyState } from "~/ui/empty-state";
import Field from "~/ui/field";
import { Input } from "~/ui/input";
import Pagination from "~/ui/pagination";
import { Table, TBody, Td, Th, THead, Tr } from "~/ui/table";

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
    <Panel
      id="audit-events"
      title="Audit events"
      help={`${totalCount} matching event${totalCount === 1 ? "" : "s"}`}
    >
      <form
        className="con-filters"
        method="get"
        aria-label="Filter audit events"
      >
        <Field label="Source" htmlFor="audit-source">
          <span className="input select">
            <select
              id="audit-source"
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
          </span>
        </Field>
        <Field label="Action" htmlFor="audit-action">
          <Input
            id="audit-action"
            defaultValue={filters.action}
            name="action"
            placeholder="attendance.recorded"
          />
        </Field>
        <Field label="Target type" htmlFor="audit-target">
          <Input
            id="audit-target"
            defaultValue={filters.targetType}
            name="targetType"
            placeholder="attendance"
          />
        </Field>
        <Button type="submit" variant="outline" className="con-filter-go">
          Filter
        </Button>
      </form>

      {entries.length === 0 ? (
        <EmptyState
          title="No matching audit events"
          description="Try a different source, action or target type."
        />
      ) : (
        <Table caption="Audit events, newest first">
          <THead>
            <Tr>
              <Th>Action</Th>
              <Th>Target</Th>
              <Th>Source</Th>
              <Th>Actor</Th>
              <Th aria-sort="descending">When</Th>
            </Tr>
          </THead>
          <TBody>
            {entries.map((entry) => (
              <Tr key={entry.id}>
                <Td strong>
                  <Link
                    className="textlink"
                    href={`/console/audit-log/${entry.id}`}
                  >
                    {humanize(entry.action)}
                  </Link>
                </Td>
                <Td wrap className="mono">
                  {entry.targetType}: {entry.targetName ?? entry.targetId}
                </Td>
                <Td>
                  <Badge>{humanize(entry.source)}</Badge>
                </Td>
                <Td wrap>{entry.actorName}</Td>
                <Td>{formatEventDateTime(entry.createdAt)}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}

      <div className="con-foot">
        <Pagination
          page={page}
          totalPages={totalPages}
          buildHref={buildPageHref}
          label="events"
          totalCount={totalCount}
        />
      </div>
    </Panel>
  );
}
