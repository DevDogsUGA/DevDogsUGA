import type { PropsWithChildren } from "react";

/**
 * What the account page looks like while a profile is under moderation.
 *
 * A moderator resolving a report with `quarantine` sets
 * `platform."profile"."quarantinedBy"`, which resets the display name to the
 * member's name of record and — via the policies in
 * 20260808000000_platform_profile_moderation.sql — stops them changing it back.
 *
 * ⚠️ THIS IS PRESENTATION, NOT ENFORCEMENT. Every write below is refused by
 * RLS whether or not this renders, and a denied UPDATE under RLS is not an
 * error: it matches no rows. So a page that let the fields stay live would show
 * a member typing a new name, saving it, and seeing the old one come back with
 * no explanation. That is the failure this exists to prevent — not a security
 * boundary, a way of saying what already happened.
 *
 * `inert` rather than a `disabled` prop threaded through six field components:
 * it removes the whole subtree from interaction AND from the accessibility
 * tree, in one attribute, and it cannot be forgotten by a field added later.
 */
export function FrozenFields({ children }: PropsWithChildren) {
  return (
    <div inert className="opacity-50 select-none">
      {children}
    </div>
  );
}

/**
 * The notice itself.
 *
 * Deliberately GENERIC. The subject cannot read their own resolution —
 * `reporter_or_moderator_select` covers the reporter and moderators, and
 * "moderatorNote" is internal by design — so anything more specific would need
 * new RLS, and the specific version most people would write ("your name was
 * reported as...") risks identifying the reporter. Reports should be rare
 * enough that a member contacts an officer either way.
 */
export function FrozenProfileNotice() {
  return (
    <div
      role="status"
      className="flex flex-col gap-1 rounded-md border border-amber-700/60 bg-amber-950/40 px-4 py-3"
    >
      <span className="text-sm font-medium text-amber-200">
        Your profile is under moderation
      </span>
      <span className="text-xs text-balance text-amber-100/80">
        Your display name has been reset and your profile cannot be edited right
        now. Contact an officer if you think this is a mistake.
      </span>
    </div>
  );
}
