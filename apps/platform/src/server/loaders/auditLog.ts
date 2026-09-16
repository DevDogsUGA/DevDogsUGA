import { and, count, desc, eq, type SQL } from "drizzle-orm";
import { notFound } from "next/navigation";
import { cache } from "react";
import type { AuditSource } from "~/lib/audit";
import { canUserViewAuditLog } from "~/server/actions/permissions";
import { requirePermission } from "~/server/auth/require";
import { db } from "~/server/db";
import { auditEvents, reflectionRevisions } from "~/server/db/schema";

export const PAGE_SIZE = 50;

export type AuditLogFilters = {
  source?: AuditSource;
  action?: string;
  targetType?: string;
};

export type AuditLogEntry = {
  id: string;
  createdAt: string;
  actor: string;
  source: AuditSource;
  action: string;
  targetType: string;
  targetId: string;
  correlationId: string | null;
  metadata: unknown;
  beforeReflectionRevisionId: string | null;
  afterReflectionRevisionId: string | null;
};

export type AuditLogPageData = {
  entries: AuditLogEntry[];
  filters: AuditLogFilters;
  page: number;
  totalCount: number;
  pageSize: number;
};

export type ReflectionRevisionDetail = {
  id: string;
  reflectionId: string;
  userId: string;
  meetingId: string | null;
  competitionId: string | null;
  content: string;
  submittedAt: string | null;
  createdAt: string;
  createdByUserId: string | null;
  createdByAirtableUserId: string | null;
  changeReason: string | null;
};

export const getAuditLogPageData = cache(
  async (
    page: number,
    filters: AuditLogFilters = {},
  ): Promise<AuditLogPageData> => {
    await requirePermission(canUserViewAuditLog);

    const predicates: SQL[] = [];
    if (filters.source) predicates.push(eq(auditEvents.source, filters.source));
    if (filters.action) predicates.push(eq(auditEvents.action, filters.action));
    if (filters.targetType)
      predicates.push(eq(auditEvents.targetType, filters.targetType));
    const where = predicates.length > 0 ? and(...predicates) : undefined;

    const offset = (page - 1) * PAGE_SIZE;
    const [countRow] = await db
      .select({ value: count() })
      .from(auditEvents)
      .where(where);

    const rows = await db
      .select()
      .from(auditEvents)
      .where(where)
      .orderBy(desc(auditEvents.createdAt), desc(auditEvents.id))
      .limit(PAGE_SIZE)
      .offset(offset);

    const entries = rows.map((row): AuditLogEntry => {
      const actor =
        row.actorAirtableDisplayName ??
        row.actorAirtableUserId ??
        row.actorUserId ??
        "System";

      return {
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        actor,
        source: row.source,
        action: row.action,
        targetType: row.targetType,
        targetId: row.targetId,
        correlationId: row.correlationId,
        metadata: row.metadata,
        beforeReflectionRevisionId: row.beforeReflectionRevisionId,
        afterReflectionRevisionId: row.afterReflectionRevisionId,
      };
    });

    return {
      entries,
      filters,
      page,
      totalCount: countRow?.value ?? 0,
      pageSize: PAGE_SIZE,
    };
  },
);

export const getAuditEventDetailData = cache(async (eventId: string) => {
  await requirePermission(canUserViewAuditLog);

  const [event] = await db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.id, eventId))
    .limit(1);
  if (!event) notFound();

  const readRevision = async (id: string | null) => {
    if (id === null) return undefined;
    const [revision] = await db
      .select()
      .from(reflectionRevisions)
      .where(eq(reflectionRevisions.id, id))
      .limit(1);
    return revision;
  };
  const [beforeRevisionRow, afterRevisionRow] = await Promise.all([
    readRevision(event.beforeReflectionRevisionId),
    readRevision(event.afterReflectionRevisionId),
  ]);

  const serializeRevision = (
    revision: Awaited<ReturnType<typeof readRevision>>,
  ): ReflectionRevisionDetail | null =>
    revision
      ? {
          ...revision,
          submittedAt: revision.submittedAt?.toISOString() ?? null,
          createdAt: revision.createdAt.toISOString(),
        }
      : null;

  return {
    event: {
      id: event.id,
      createdAt: event.createdAt.toISOString(),
      actorType: event.actorType,
      actor:
        event.actorAirtableDisplayName ??
        event.actorAirtableUserId ??
        event.actorUserId ??
        "System",
      source: event.source,
      action: event.action,
      targetType: event.targetType,
      targetId: event.targetId,
      correlationId: event.correlationId,
      metadata: event.metadata,
    },
    beforeRevision: serializeRevision(beforeRevisionRow),
    afterRevision: serializeRevision(afterRevisionRow),
  };
});
