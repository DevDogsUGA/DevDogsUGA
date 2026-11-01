CREATE OR REPLACE FUNCTION platform.request_commit_backfill()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  -- Only commits by linked members are stored, so linking GitHub is what
  -- makes a member's history eligible. Queue it by GitHub user id, never by
  -- login. A provider_id that is not a positive bigint cannot be matched, so
  -- it is skipped rather than failing the sign-in.
  if new.provider = 'github' and new.provider_id ~ '^[1-9][0-9]{0,18}$' then
    if new.provider_id::numeric <= 9223372036854775807 then
      insert into platform."commitBackfillRequests" ("userId", "githubId")
      values (new.user_id, new.provider_id::bigint)
      on conflict ("userId") do update
        set "githubId" = excluded."githubId",
            "requestedAt" = now(),
            "completedAt" = null;
    end if;
  end if;
  return new;
end;
$function$;

GRANT EXECUTE ON FUNCTION platform.request_commit_backfill() TO "postgres", "service_role";

REVOKE ALL ON FUNCTION platform.request_commit_backfill() FROM PUBLIC, "anon", "authenticated";
