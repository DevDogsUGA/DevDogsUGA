-- Which Worker version last reconciled @devdogsuga/events, and what it applied.
--
-- The config is bundled into the Worker at build time, so every deployed
-- version carries its own copy, and any of them can run the reconcile: the
-- fifteen-minute cron, or the deploy's own call. Nothing used to stop an
-- OLDER version from running it after a newer one had. On 2026-10-05 the
-- previous Worker's cron fired mid-deploy and put back the meeting the new
-- config had just renamed, and the deploy's own reconcile then reached that
-- same old Worker and changed nothing.
--
-- One row. "workerVersionTimestamp" is when the version that last applied the
-- config was uploaded (Cloudflare's version metadata). A reconcile from a
-- version uploaded before it is refused, so the newest upload always wins. A
-- rollback by redeploying an old commit uploads a new version and still goes
-- through; `wrangler rollback` to an old version does not, by design.
--
-- "configHash" is what that version applied, so a run can tell whether the
-- config actually changed and only then invalidate the cached schedule.
--
-- Server-only: RLS on, closed on every verb, reached through the owner
-- connection like "discordRoleMemberships".

create table "platform"."configReconcileState" (
  "id" boolean not null default true,
  "workerVersionId" text not null,
  "workerVersionTimestamp" timestamptz not null,
  "configHash" text not null,
  "appliedAt" timestamptz not null default now(),

  constraint "configReconcileState_pkey" primary key ("id"),
  constraint "configReconcileState_single_row" check ("id")
);

alter table "platform"."configReconcileState" enable row level security;

create policy "crud_public_policy_delete" on "platform"."configReconcileState"
  as restrictive for delete to public using (false);
create policy "crud_public_policy_insert" on "platform"."configReconcileState"
  as restrictive for insert to public with check (false);
create policy "crud_public_policy_select" on "platform"."configReconcileState"
  as restrictive for select to public using (false);
create policy "crud_public_policy_update" on "platform"."configReconcileState"
  as restrictive for update to public using (false) with check (false);
