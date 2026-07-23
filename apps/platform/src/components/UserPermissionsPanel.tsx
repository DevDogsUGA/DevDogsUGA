"use client";

import { useEffect, useState } from "react";
import { CheckIcon, XIcon, SpinnerGapIcon } from "@phosphor-icons/react/ssr";
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
  canManageFeedback: "Manage site feedback",
  canCreateCredentials: "Create credentials",
  canManageVerification: "Manage verification",
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
    setLoading(true);
    getUserResolvedPermissions(userId)
      .then(setData)
      .finally(() => setLoading(false));
  }, [userId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-white/50">
        <SpinnerGapIcon className="h-4 w-4 animate-spin" aria-hidden />
        Loading permissions…
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="mt-2 rounded-lg border border-white/10 bg-white/5 p-4">
      {/* Assigned roles */}
      <div className="mb-3">
        <p className="mb-2 text-xs font-semibold tracking-wider text-white/50 uppercase">
          Assigned roles
        </p>
        {data.roles.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {data.roles.map((role) => (
              <span
                key={role.id}
                className="rounded-full px-2.5 py-0.5 text-xs font-medium text-white"
                style={{
                  backgroundColor: role.color ?? "#818cf8" + "33",
                  borderColor: role.color ?? "#818cf8",
                  borderWidth: 1,
                }}
              >
                {role.title}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-white/40">
            No roles assigned (defaults to member).
          </p>
        )}
      </div>

      {/* Resolved permissions */}
      <p className="mb-2 text-xs font-semibold tracking-wider text-white/50 uppercase">
        Resolved permissions
      </p>
      <div className="grid grid-cols-1 gap-y-1.5 @sm:grid-cols-2">
        {PERMISSION_KEYS.map((key) => (
          <div key={key} className="flex items-center gap-2 text-xs">
            {data.resolved[key] ? (
              <CheckIcon
                className="h-3.5 w-3.5 shrink-0 text-green-400"
                aria-hidden
              />
            ) : (
              <XIcon className="h-3.5 w-3.5 shrink-0 text-white/30" aria-hidden />
            )}
            <span
              className={data.resolved[key] ? "text-white/80" : "text-white/40"}
            >
              {PERMISSION_LABELS[key]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
