SET local check_function_bodies = off;

ALTER TABLE "platform"."attendance"
  DROP CONSTRAINT "attendance_userId_fkey";

ALTER TABLE "platform"."moderationDeliveries"
  DROP CONSTRAINT "moderationDeliveries_type_check";

ALTER TABLE "platform"."oauthRegistrations"
  DROP CONSTRAINT "oauthRegistrations_userId_users_id_fkey";

ALTER TABLE "platform"."reportCorroborations"
  DROP CONSTRAINT "reportCorroborations_reporterUserId_fkey";

ALTER TABLE "platform"."reportResolutions"
  DROP CONSTRAINT "reportResolutions_moderatorUserId_fkey";

ALTER TABLE "platform"."reports"
  DROP CONSTRAINT "reports_reportedUserId_fkey";

ALTER TABLE "platform"."reports"
  DROP CONSTRAINT "reports_reporterUserId_fkey";

CREATE TABLE "platform"."deletedAccountBlocks" (
  "subjectHash" bytea                    NOT NULL,
  "expiresAt"   timestamp with time zone,
  "createdAt"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "deletedAccountBlocks_pkey" PRIMARY KEY ("subjectHash")
);

ALTER TABLE "platform"."deletedAccountBlocks"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "platform"."attendance"
  ALTER COLUMN "userId" DROP NOT NULL;

ALTER TABLE "platform"."oauthRegistrations"
  ALTER COLUMN "userId" DROP NOT NULL;

ALTER TABLE "platform"."reportCorroborations"
  ALTER COLUMN "reporterUserId" DROP NOT NULL;

ALTER TABLE "platform"."reportResolutions"
  ALTER COLUMN "moderatorUserId" DROP NOT NULL;

ALTER TABLE "platform"."reports"
  ALTER COLUMN "reportedUserId" DROP NOT NULL;

ALTER TABLE "platform"."reports"
  ALTER COLUMN "reporterUserId" DROP NOT NULL;

CREATE OR REPLACE FUNCTION platform.deleted_account_hash (
  subject text
)
  RETURNS bytea
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  -- The key is the Vault secret `deleted_account_block_key`. Without it the
  -- result is null: the hook then lets everyone through, and the deletion job
  -- must refuse to write a block row rather than store a null hash.
  select extensions.hmac(
    convert_to(lower(trim(subject)), 'utf8'),
    convert_to(s.decrypted_secret, 'utf8'),
    'sha256'
  )
  from vault.decrypted_secrets s
  where s.name = 'deleted_account_block_key'
  limit 1;
$function$;

CREATE OR REPLACE FUNCTION platform.is_deleted_account_blocked (
  subject text
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select exists (
    select 1
    from "platform"."deletedAccountBlocks" b
    where b."subjectHash" = "platform".deleted_account_hash(subject)
      and (b."expiresAt" is null or b."expiresAt" > now())
  );
$function$;

CREATE OR REPLACE FUNCTION platform.require_uga_signup_email (
  event jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  email text := lower(trim(event -> 'user' ->> 'email'));
  provider text := event -> 'user' -> 'app_metadata' ->> 'provider';
begin
  if provider = 'email' then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 400,
        'message', 'Password sign-up is disabled. Sign in with Discord, GitHub, Google, or LinkedIn.'
      )
    );
  end if;

  if email ~ '^[^@[:space:]]+@uga[.]edu$' then
    -- The UGA address is the subject a deleted account is blocked by (see
    -- platform."deletedAccountBlocks").
    if "platform".is_deleted_account_blocked(email) then
      return jsonb_build_object(
        'error', jsonb_build_object(
          'http_code', 403,
          'message', 'This account was deleted while a moderation action was in effect. Contact DevDogs to sign in.'
        )
      );
    end if;

    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'Sign in with your uga.edu email address.'
    )
  );
end;
$function$;

CREATE OR REPLACE FUNCTION platform.resolve_report_as (
  actor          uuid,
  report_id      uuid,
  subject_action platform."subjectAction",
  filer_action   platform."filerAction",
  content_action platform."contentAction",
  moderator_note text                     DEFAULT NULL::text,
  apply_globally boolean                  DEFAULT false
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  report     record;
  app_slug   text;
  resolution uuid;
  external   boolean;
  reason_txt text;
  scope_app  uuid;
  deliveries uuid[] := '{}';
begin
  if actor is null then
    raise exception 'resolve_report() requires a moderator';
  end if;
  if not "platform".has_permission(actor, 'canModerate') then
    raise exception 'resolve_report() requires the canModerate permission';
  end if;

  select r.*, a."slug" as slug, a."kind" as app_kind into report
  from "platform"."reports" r
  join "platform"."apps" a on a."id" = r."appId"
  where r."id" = report_id;

  if not found then
    raise exception 'Report % does not exist', report_id;
  end if;
  if report."status" <> 'open' then
    raise exception 'Report % has already been decided', report_id;
  end if;
  app_slug := report.slug;
  external := report.app_kind = 'external';

  update "platform"."reports"
  set "status" = 'resolved', "resolvedAt" = now()
  where "id" = report_id;

  insert into "platform"."reportResolutions" (
    "reportId", "moderatorUserId", "subjectAction", "filerAction",
    "contentAction", "appliedGlobally", "moderatorNote"
  ) values (
    report_id, actor, subject_action, filer_action,
    content_action, coalesce(apply_globally, false), moderator_note
  ) returning "id" into resolution;

  if external then
    -- The app's rows are in another database: record the decision and owe the
    -- app a signed message. Quarantine is a hide; restore is a separate action.
    if content_action = 'quarantine' then
      deliveries := deliveries || "platform".enqueue_moderation_delivery(
        report."appId",
        'content.hide',
        jsonb_build_object(
          'contentType', report."contentType",
          'contentRef',  report."contentRef",
          'reportId',    report_id
        ),
        report_id
      );
    end if;
  else
    -- Inside the same transaction as the decision, and raises rather than
    -- no-oping, so a content action that cannot be applied aborts the whole
    -- resolution instead of recording an outcome that silently never landed.
    perform "platform".apply_content_action(
      app_slug, report."contentType", report."contentRef", content_action, resolution
    );
  end if;

  -- A deleted member's id on the report is null: there is nobody to act on.
  if coalesce(apply_globally, false) then
    if subject_action in ('suspend', 'ban') and report."reportedUserId" is not null then
      insert into "platform"."userSuspensions" ("userId", "service", "suspendedBy")
      values (report."reportedUserId", 'global', actor)
      on conflict ("userId", "service") do update
        set "suspendedBy" = actor, "suspendedAt" = now();
    end if;

    if filer_action = 'suspend' and report."reporterUserId" is not null then
      insert into "platform"."userSuspensions" ("userId", "service", "suspendedBy")
      values (report."reporterUserId", 'global', actor)
      on conflict ("userId", "service") do update
        set "suspendedBy" = actor, "suspendedAt" = now();
    end if;
  end if;

  -- Standing changes reach every external app when global, and the reported
  -- app alone otherwise. The reason is the report's category, never the
  -- moderator's private note.
  if (subject_action in ('suspend', 'ban') or filer_action = 'suspend')
     and (coalesce(apply_globally, false) or external) then
    reason_txt := report."reason"::text;
    scope_app := case when coalesce(apply_globally, false) then null else report."appId" end;

    if subject_action in ('suspend', 'ban') and report."reportedUserId" is not null then
      deliveries := deliveries || "platform".enqueue_user_standing(
        report."reportedUserId", subject_action::text, reason_txt, report_id, scope_app
      );
    end if;
    if filer_action = 'suspend' and report."reporterUserId" is not null then
      deliveries := deliveries || "platform".enqueue_user_standing(
        report."reporterUserId", 'suspend', reason_txt, report_id, scope_app
      );
    end if;
  end if;

  return jsonb_build_object(
    'resolutionId', resolution,
    -- Non-null only when Supabase's native ban still has to be applied by a
    -- caller with admin credentials.
    'bannedUserId', case
      when coalesce(apply_globally, false) and subject_action = 'ban'
        and report."reportedUserId" is not null
      then report."reportedUserId"
    end,
    -- The deliveries this decision owes that are ready to send, for the caller
    -- to queue once the transaction has committed. One already marked failed
    -- (its app has no endpoint) waits for a person and a resend instead.
    'deliveryIds', (
      select coalesce(jsonb_agg(d."id" order by d."createdAt", d."id"), '[]'::jsonb)
      from "platform"."moderationDeliveries" d
      where d."id" = any(deliveries) and d."status" = 'pending'
    )
  );
end;
$function$;

ALTER TABLE "platform"."attendance"
  ADD CONSTRAINT "attendance_userId_fkey" FOREIGN KEY ("userId") REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE "platform"."moderationDeliveries"
  ADD CONSTRAINT "moderationDeliveries_type_check"
    CHECK
    ((type = ANY (ARRAY['content.hide'::text, 'content.remove'::text, 'content.restore'::text, 'user.suspend'::text, 'user.ban'::text, 'user.restore'::text, 'user.delete'::text])));

ALTER TABLE "platform"."oauthRegistrations"
  ADD CONSTRAINT "oauthRegistrations_userId_users_id_fkey" FOREIGN KEY ("userId") REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE "platform"."reportCorroborations"
  ADD CONSTRAINT "reportCorroborations_reporterUserId_fkey" FOREIGN KEY ("reporterUserId") REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "platform"."reportResolutions"
  ADD CONSTRAINT "reportResolutions_moderatorUserId_fkey" FOREIGN KEY ("moderatorUserId") REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "platform"."reports"
  ADD CONSTRAINT "reports_reportedUserId_fkey" FOREIGN KEY ("reportedUserId") REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "platform"."reports"
  ADD CONSTRAINT "reports_reporterUserId_fkey" FOREIGN KEY ("reporterUserId") REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE POLICY "crud_public_policy_delete" ON "platform"."deletedAccountBlocks"
  AS RESTRICTIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_insert" ON "platform"."deletedAccountBlocks"
  AS RESTRICTIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (false);

CREATE POLICY "crud_public_policy_select" ON "platform"."deletedAccountBlocks"
  AS RESTRICTIVE
  FOR SELECT
  TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_update" ON "platform"."deletedAccountBlocks"
  AS RESTRICTIVE
  FOR UPDATE
  TO PUBLIC
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "platform"."deletedAccountBlocks" IS 'Server-only. A member who deleted their account during a suspension or ban: the keyed hash of their UGA subject (platform.deleted_account_hash) and when the block lifts (null = never). The before-user-created hook refuses a sign-up whose subject matches an unexpired row, so deleting an account is not a way out of a moderation action.';

REVOKE ALL ON FUNCTION "platform"."deleted_account_hash"(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "platform"."deleted_account_hash"(text) TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "platform"."is_deleted_account_blocked"(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "platform"."is_deleted_account_blocked"(text) TO "postgres", "service_role", "supabase_auth_admin";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."deletedAccountBlocks" TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "platform"."deleted_account_hash"(text) FROM "anon";

REVOKE ALL ON FUNCTION "platform"."deleted_account_hash"(text) FROM "authenticated";

REVOKE ALL ON FUNCTION "platform"."is_deleted_account_blocked"(text) FROM "anon";

REVOKE ALL ON FUNCTION "platform"."is_deleted_account_blocked"(text) FROM "authenticated";

REVOKE ALL ON TABLE "platform"."deletedAccountBlocks" FROM "anon";

REVOKE ALL ON TABLE "platform"."deletedAccountBlocks" FROM "authenticated";

-- Stage A1 data step: a production client is a DevDogs app (oauth-consent Q161) with no
-- owner, so deleting whoever registered it cannot delete it. Idempotent.
update platform."oauthRegistrations"
   set "userId" = null
 where tier = 'production'
   and "userId" is not null;
