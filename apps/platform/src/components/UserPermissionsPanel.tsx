"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import {
  CheckCircleIcon,
  CircleIcon,
  SpinnerGapIcon,
} from "@phosphor-icons/react/ssr";
import { getUserResolvedPermissions } from "~/server/actions/permissions";
import type {
  RoleSummary,
  ResolvedPermissions,
} from "~/server/actions/permissions";

const PERMISSION_LABELS: Record<string, string> = {
  canModerate: "Moderate reports",
  canManageRoles: "Manage roles & permissions",
  canManageSuspensions: "Manage suspensions",
  canViewAuditLog: "View audit log",
  canManageAttendance: "Manage attendance",
  canPreviewDocs: "Preview docs",
  canManageOAuthApps: "Manage OAuth apps",
  canDeleteAccounts: "Delete accounts",
};

const PERMISSION_KEYS = Object.keys(
  PERMISSION_LABELS,
) as (keyof ResolvedPermissions)[];

interface Props {
  userId: string;
}

export default function UserPermissionsPanel({ userId }: Props) {
  const [data, setData] = useState<{
    roles: RoleSummary[];
    resolved: ResolvedPermissions;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Data-fetch on userId change: flag loading, then populate on resolve.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    void getUserResolvedPermissions(userId)
      .then(setData)
      .finally(() => setLoading(false));
  }, [userId]);

  if (loading) {
    return (
      <div className="con-meta" style={{ padding: "16px 0" }}>
        <SpinnerGapIcon className="animate-spin" aria-hidden />
        Loading permissions…
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="con-perms">
      <p className="eyebrow" style={{ margin: "0 0 8px" }}>
        Assigned roles
      </p>
      {data.roles.length > 0 ? (
        <div className="con-roles">
          {data.roles.map((role) => (
            <RoleChip key={role.id} color={role.color}>
              {role.title}
            </RoleChip>
          ))}
        </div>
      ) : (
        <p className="small muted" style={{ margin: 0 }}>
          No roles assigned (defaults to member).
        </p>
      )}

      <p className="eyebrow" style={{ margin: "16px 0 8px" }}>
        What they can do, from all of their roles
      </p>
      <ul className="con-perm-grid">
        {PERMISSION_KEYS.map((key) => {
          const on = data.resolved[key];
          return (
            <li key={key} data-on={on || undefined}>
              {on ? (
                <CheckCircleIcon weight="bold" aria-hidden />
              ) : (
                <CircleIcon aria-hidden />
              )}
              {PERMISSION_LABELS[key]}
              <span className="sr-only">
                {on ? " (granted)" : " (not granted)"}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** A role's name in its own colour (a data value, so an inline custom property). */
export function RoleChip({
  color,
  children,
}: {
  color: string | null;
  children: ReactNode;
}) {
  return (
    <span
      className="con-role"
      style={{ "--rc": color ?? "#818cf8" } as CSSProperties}
    >
      {children}
    </span>
  );
}
