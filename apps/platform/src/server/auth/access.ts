import "server-only";

import { cache } from "react";
import { forbidden, notFound } from "next/navigation";
import { expectSession } from "~/server/auth";
import { getCallerContext, type ResolvedPermissions } from "./permissions";
import { mayUseGraphics } from "~/lib/graphicsAccess";

/** The signed-in member, loaded once per request for all Access rules. */
export type Caller = {
  userId: string;
  flags: ResolvedPermissions;
  isLeader: boolean;
  minRank: number;
};

/** Read one resolved-permissions row; members without roles get no grants. */
export const loadCaller = cache(async (): Promise<Caller | null> => {
  const userId = await expectSession().catch(() => null);
  if (!userId) return null;
  const {
    resolvedPermissions: flags,
    isLeader,
    minRank,
  } = await getCallerContext(userId);
  return { userId, flags, isLeader, minRank };
});

/** An Access rule needs only the Caller; Record rules stay in domain modules. */
export type Rule = (caller: Caller) => boolean;

export const rules = {
  manageAttendance: (caller) => caller.flags.canManageAttendance,
  useGraphics: (caller) =>
    mayUseGraphics({
      isLeader: caller.isLeader,
      canManageAttendance: caller.flags.canManageAttendance,
    }),
  officer: (caller) => caller.isLeader,
  moderate: (caller) => caller.flags.canModerate,
  manageSuspensions: (caller) => caller.flags.canManageSuspensions,
  viewAuditLog: (caller) => caller.flags.canViewAuditLog,
  manageRoles: (caller) => caller.flags.canManageRoles,
  manageOAuthApps: (caller) => caller.flags.canManageOAuthApps,
  previewDocs: (caller) => caller.flags.canPreviewDocs,
  deleteAccounts: (caller) => caller.flags.canDeleteAccounts,
  reviewProjectReports: (caller) => caller.flags.canReviewProjectReports,
} satisfies Record<string, Rule>;

/** Keep the existing signed-out 404 until the dashboard route migration. */
export async function requireAccess(rule: Rule): Promise<Caller> {
  const caller = await loadCaller();
  if (!caller) notFound();
  if (!rule(caller)) forbidden();
  return caller;
}

type Authorization =
  { ok: true; caller: Caller } | { ok: false; message: string };

/** Authorize an action without imposing its existing return or error shape. */
export async function authorize(rule: Rule): Promise<Authorization> {
  const result = await authorizeSession();
  if (!result.ok) return result;
  return rule(result.caller)
    ? result
    : { ok: false, message: "Not authorized." };
}

/** Actions on a member's own records still apply their domain Record rules. */
export async function authorizeSession(): Promise<Authorization> {
  const caller = await loadCaller();
  return caller
    ? { ok: true, caller }
    : { ok: false, message: "Session expected but not found." };
}

/** Explicit marker for a public action. Each call documents why no session is needed. */
export function publicAction(): void {
  // Intentionally permits a public entry point; the call site documents why.
  return;
}
