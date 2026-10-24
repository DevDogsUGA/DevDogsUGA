SET local check_function_bodies = off;

CREATE TABLE "platform"."badgeAwards" (
  "id"                   uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "userId"               uuid                     NOT NULL,
  "badgeId"              text                     NOT NULL,
  "workshopDefinitionId" text,
  "method"               text                     NOT NULL,
  "repeatable"           boolean                  NOT NULL,
  "awardedAt"            timestamp with time zone NOT NULL DEFAULT now(),
  "awardedBy"            uuid,
  "citation"             text,
  "meetingId"            uuid,
  "contributionId"       uuid,
  "withdrawnAt"          timestamp with time zone,
  "withdrawnReason"      text,
  "hidden"               boolean                  NOT NULL DEFAULT false,
  CONSTRAINT "badgeAwards_badgeId_format" CHECK (("badgeId" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text)),
  CONSTRAINT "badgeAwards_citation_shape" CHECK ((((method = 'automatic'::text) AND (citation IS NULL) AND ("awardedBy" IS NULL)) OR ((method = 'manual'::text) AND (citation IS
    NOT NULL) AND ((char_length(btrim(citation)) >= 1) AND (char_length(btrim(citation)) <= 280))))),
  CONSTRAINT "badgeAwards_method_choices" CHECK ((method = ANY (ARRAY['automatic'::text, 'manual'::text]))),
  CONSTRAINT "badgeAwards_pkey" PRIMARY KEY (id),
  CONSTRAINT "badgeAwards_withdrawn_shape" CHECK (((("withdrawnAt" IS NULL) AND ("withdrawnReason" IS NULL)) OR (("withdrawnAt" IS NOT NULL) AND ("withdrawnReason" IS
    NOT NULL) AND ((char_length(btrim("withdrawnReason")) >= 1) AND (char_length(btrim("withdrawnReason")) <= 280))))),
  CONSTRAINT "badgeAwards_workshop_shape" CHECK (((("badgeId" = 'workshop-completed'::text) = ("workshopDefinitionId" IS
    NOT NULL)) AND (("workshopDefinitionId" IS NULL) OR ("workshopDefinitionId" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text))))
);

ALTER TABLE "platform"."badgeAwards"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "platform"."reflections"
  ADD COLUMN "workshopDefinitionId" text;

CREATE OR REPLACE FUNCTION platform.award_first_merge (
  p_user uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_contribution uuid;
  v_new_id uuid;
begin
  if p_user is null
     or exists (select 1 from platform."badgeAwards" b
                 where b."userId" = p_user and b."badgeId" = 'first-merge') then
    return;
  end if;

  select c.id into v_contribution
    from platform.contributions c
   where c."userId" = p_user
   order by c."mergedAt", c.id
   limit 1;
  if v_contribution is null then
    return;
  end if;

  insert into platform."badgeAwards"
    ("userId", "badgeId", "method", "repeatable", "contributionId")
  values (p_user, 'first-merge', 'automatic', false, v_contribution)
  on conflict ("userId", "badgeId", (coalesce("workshopDefinitionId", '')))
    where "withdrawnAt" is null and not "repeatable"
    do nothing
  returning id into v_new_id;

  if v_new_id is not null then
    insert into platform."auditEvents"
      ("actorType", "source", "action", "targetType", "targetId", "metadata")
    values ('system', 'platform', 'badge.awarded', 'badgeAward', v_new_id::text,
      jsonb_build_object('userId', p_user, 'badgeId', 'first-merge',
        'contributionId', v_contribution, 'automatic', true));
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION platform.badges_after_attendance()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_user uuid;
  v_meeting uuid;
  v_definition text;
begin
  if tg_op = 'DELETE' then
    v_user := old."userId";
    v_meeting := old."meetingId";
  else
    v_user := new."userId";
    v_meeting := new."meetingId";
  end if;
  if v_user is null then
    return null;
  end if;
  for v_definition in
    select distinct r."workshopDefinitionId"
      from platform.reflections r
     where r."userId" = v_user and r."meetingId" = v_meeting
       and r."workshopDefinitionId" is not null
  loop
    perform platform.sync_workshop_badge(v_user, v_definition);
  end loop;
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION platform.badges_after_contribution()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if new."userId" is not null then
    perform platform.award_first_merge(new."userId");
  end if;
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION platform.badges_after_reflection()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if tg_op = 'DELETE' then
    if old."meetingId" is not null then
      perform platform.sync_workshop_badge(old."userId", old."workshopDefinitionId");
    end if;
    return null;
  end if;
  if new."meetingId" is not null then
    perform platform.sync_workshop_badge(new."userId", new."workshopDefinitionId");
  end if;
  if tg_op = 'UPDATE' and old."meetingId" is not null
     and old."workshopDefinitionId" is distinct from new."workshopDefinitionId" then
    perform platform.sync_workshop_badge(old."userId", old."workshopDefinitionId");
  end if;
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION platform.sync_workshop_badge (
  p_user       uuid,
  p_definition text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_valid uuid[];
  v_award_id uuid;
  v_award_meeting uuid;
  v_new_id uuid;
begin
  if p_definition is null
     or not exists (select 1 from auth.users u where u.id = p_user) then
    return;
  end if;

  select array_agg(q."meetingId" order by q."startsAt", q."meetingId")
    into v_valid
    from (
      select r."meetingId", m."startsAt"
        from platform.reflections r
        join platform.attendance a
          on a."userId" = r."userId" and a."meetingId" = r."meetingId"
        join platform.meetings m on m.id = r."meetingId"
       where r."userId" = p_user
         and r."workshopDefinitionId" = p_definition
         and r."submittedAt" is not null
         and m."deletedAt" is null
         and m."cancelledAt" is null
         and exists (
           select 1 from platform.workshops w
            where w."meetingId" = r."meetingId"
              and w."definitionId" = p_definition
              and w."deletedAt" is null)
    ) q;

  select b.id, b."meetingId" into v_award_id, v_award_meeting
    from platform."badgeAwards" b
   where b."userId" = p_user
     and b."badgeId" = 'workshop-completed'
     and b."workshopDefinitionId" = p_definition
     and b."withdrawnAt" is null;

  if v_valid is not null then
    if v_award_id is null then
      insert into platform."badgeAwards"
        ("userId", "badgeId", "workshopDefinitionId", "method", "repeatable", "meetingId")
      values (p_user, 'workshop-completed', p_definition, 'automatic', false, v_valid[1])
      on conflict ("userId", "badgeId", (coalesce("workshopDefinitionId", '')))
        where "withdrawnAt" is null and not "repeatable"
        do nothing
      returning id into v_new_id;
      if v_new_id is not null then
        insert into platform."auditEvents"
          ("actorType", "source", "action", "targetType", "targetId", "metadata")
        values ('system', 'platform', 'badge.awarded', 'badgeAward', v_new_id::text,
          jsonb_build_object('userId', p_user, 'badgeId', 'workshop-completed',
            'workshopDefinitionId', p_definition, 'meetingId', v_valid[1],
            'automatic', true));
      end if;
    elsif v_award_meeting is null or not (v_award_meeting = any (v_valid)) then
      update platform."badgeAwards" set "meetingId" = v_valid[1] where id = v_award_id;
    end if;
  elsif v_award_id is not null then
    update platform."badgeAwards"
       set "withdrawnAt" = now(),
           "withdrawnReason" = 'The attendance or submitted reflection that supported it no longer exists.'
     where id = v_award_id;
    insert into platform."auditEvents"
      ("actorType", "source", "action", "targetType", "targetId", "metadata")
    values ('system', 'platform', 'badge.withdrawn', 'badgeAward', v_award_id::text,
      jsonb_build_object('userId', p_user, 'badgeId', 'workshop-completed',
        'workshopDefinitionId', p_definition, 'automatic', true,
        'meetingId', v_award_meeting));
  end if;
end;
$function$;

ALTER TABLE "platform"."badgeAwards"
  ADD CONSTRAINT "badgeAwards_awardedBy_fkey" FOREIGN KEY ("awardedBy") REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE "platform"."badgeAwards"
  ADD CONSTRAINT "badgeAwards_contributionId_fkey" FOREIGN KEY ("contributionId") REFERENCES platform.contributions(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE "platform"."badgeAwards"
  ADD CONSTRAINT "badgeAwards_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES platform.meetings(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE "platform"."badgeAwards"
  ADD CONSTRAINT "badgeAwards_userId_fkey" FOREIGN KEY ("userId") REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE "platform"."reflections"
  ADD CONSTRAINT "reflections_workshopDefinitionId_format" CHECK ((("workshopDefinitionId" IS NULL) OR ("workshopDefinitionId" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text)));

CREATE INDEX "badgeAwards_meetingId_idx" ON platform."badgeAwards" USING btree ("meetingId")
  WHERE ("meetingId" IS NOT NULL);

CREATE UNIQUE INDEX "badgeAwards_one_live_key" ON platform."badgeAwards" USING btree ("userId", "badgeId", COALESCE("workshopDefinitionId", ''::text))
  WHERE (("withdrawnAt" IS NULL) AND (NOT repeatable));

CREATE INDEX "badgeAwards_userId_awardedAt_idx" ON platform."badgeAwards" USING btree ("userId", "awardedAt" DESC);

CREATE TRIGGER attendance_sync_badges
  AFTER INSERT OR DELETE ON platform.attendance
  FOR EACH ROW
  EXECUTE FUNCTION platform.badges_after_attendance();

CREATE TRIGGER contributions_award_first_merge
  AFTER INSERT OR UPDATE OF "userId" ON platform.contributions
  FOR EACH ROW
  EXECUTE FUNCTION platform.badges_after_contribution();

CREATE TRIGGER reflections_sync_badges
  AFTER INSERT OR DELETE OR UPDATE OF "workshopDefinitionId", "submittedAt", "meetingId" ON platform.reflections
  FOR EACH ROW
  EXECUTE FUNCTION platform.badges_after_reflection();

CREATE POLICY "crud_public_policy_delete" ON "platform"."badgeAwards"
  AS RESTRICTIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_insert" ON "platform"."badgeAwards"
  AS RESTRICTIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (false);

CREATE POLICY "crud_public_policy_select" ON "platform"."badgeAwards"
  AS RESTRICTIVE
  FOR SELECT
  TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_update" ON "platform"."badgeAwards"
  AS RESTRICTIVE
  FOR UPDATE
  TO PUBLIC
  USING (false)
  WITH CHECK (false);

COMMENT ON COLUMN "platform"."badgeAwards"."badgeId" IS 'The badge definition id from badges.json. Not a foreign key: the definitions are config, and an award whose badge was later removed still renders under its raw id.';

COMMENT ON COLUMN "platform"."badgeAwards"."citation" IS 'Manual badges only: the short public explanation of the achievement, shown beside the badge (and hidden with it).';

COMMENT ON COLUMN "platform"."badgeAwards"."contributionId" IS 'Evidence for First Merge: the member''s earliest matched merged pull request.';

COMMENT ON COLUMN "platform"."badgeAwards"."meetingId" IS 'Evidence for Workshop completed: the meeting whose attendance and submitted reflection support it. Re-pointed to another qualifying night when that one is removed; set null if the meeting row is ever deleted.';

COMMENT ON COLUMN "platform"."badgeAwards"."repeatable" IS 'Copied from the badge definition at award time. Only non-repeatable awards are held to one live row per (member, badge, workshop).';

COMMENT ON COLUMN "platform"."badgeAwards"."workshopDefinitionId" IS 'The workshop definition id, set exactly for Workshop completed awards (one badge per reusable workshop, not per night).';

COMMENT ON COLUMN "platform"."reflections"."workshopDefinitionId" IS 'The workshop (definition id from workshops.json) the member says they attended at this meeting, chosen while writing the reflection (Q95, Q98). One per reflection; self-reported. A submitted reflection that names a workshop the meeting ran is what earns the Workshop completed badge. Null on drafts and on reflections submitted before the picker existed.';

COMMENT ON TABLE "platform"."badgeAwards" IS 'Server-only. One dated award of a badge defined in badges.json (@devdogsuga/events). Automatic awards (Workshop completed, First Merge) are written by the triggers on attendance, reflections and contributions in the same transaction as the evidence; manual ones by an officer, with a required public citation. A one-time badge has one live row per (member, badge, workshop); a repeatable one many. "withdrawnAt" retires an award whose evidence went (or that an officer withdrew) and keeps the row for the record; "hidden" is the member hiding it from their public profile, which hides the citation too. Public reads go only through the public-profile loaders. Account deletion: the member''s awards are deleted with the account (ON DELETE CASCADE); a badge awarded BY a deleted officer stays with "awardedBy" set to null and is shown as awarded by "Deleted member".';

REVOKE ALL ON FUNCTION "platform"."award_first_merge"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "platform"."award_first_merge"(uuid) TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "platform"."badges_after_attendance"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "platform"."badges_after_attendance"() TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "platform"."badges_after_contribution"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "platform"."badges_after_contribution"() TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "platform"."badges_after_reflection"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "platform"."badges_after_reflection"() TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "platform"."sync_workshop_badge"(uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "platform"."sync_workshop_badge"(uuid, text) TO "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."badgeAwards" TO "postgres", "service_role";

-- Default-privilege REVOKEs the sync reports on a second pass

REVOKE ALL ON FUNCTION "platform"."award_first_merge"(uuid) FROM "anon";

REVOKE ALL ON FUNCTION "platform"."award_first_merge"(uuid) FROM "authenticated";

REVOKE ALL ON FUNCTION "platform"."badges_after_attendance"() FROM "anon";

REVOKE ALL ON FUNCTION "platform"."badges_after_attendance"() FROM "authenticated";

REVOKE ALL ON FUNCTION "platform"."badges_after_contribution"() FROM "anon";

REVOKE ALL ON FUNCTION "platform"."badges_after_contribution"() FROM "authenticated";

REVOKE ALL ON FUNCTION "platform"."badges_after_reflection"() FROM "anon";

REVOKE ALL ON FUNCTION "platform"."badges_after_reflection"() FROM "authenticated";

REVOKE ALL ON FUNCTION "platform"."sync_workshop_badge"(uuid, text) FROM "anon";

REVOKE ALL ON FUNCTION "platform"."sync_workshop_badge"(uuid, text) FROM "authenticated";

REVOKE ALL ON TABLE "platform"."badgeAwards" FROM "anon";

REVOKE ALL ON TABLE "platform"."badgeAwards" FROM "authenticated";
