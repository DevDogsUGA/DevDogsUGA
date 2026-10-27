CREATE OR REPLACE FUNCTION platform.claim_contributions()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  -- A member who links (or signs up with) GitHub takes the merged pull
  -- requests already recorded for that GitHub user id. By id, never by login.
  if new."provider" = 'github' then
    update "platform"."contributions" c
       set "userId" = new."user_id"
     where c."userId" is null
       and c."authorGithubId" = new."provider_id";
  end if;
  return new;
end;
$function$;

GRANT EXECUTE ON FUNCTION "platform"."claim_contributions"() TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "platform"."claim_contributions"() FROM PUBLIC;
