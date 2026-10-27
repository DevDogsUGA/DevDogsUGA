CREATE OR REPLACE FUNCTION platform.enforce_oauth_app_cap()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  -- DevDogs apps have no owner and never count; a transfer frees a slot.
  if new."userId" is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old."userId" is not distinct from new."userId" then
    return new;
  end if;

  -- Two apps registered at the same moment must not both see room for one.
  perform pg_advisory_xact_lock(
    hashtextextended('platform.oauthRegistrations.cap:' || new."userId"::text, 0)
  );

  if (
    select count(*) from "platform"."oauthRegistrations" r
    where r."userId" = new."userId" and r."clientId" <> new."clientId"
  ) >= 3 then
    raise exception 'a member can own at most 3 OAuth apps'
      using errcode = '23514';
  end if;
  return new;
end;
$function$;

GRANT EXECUTE ON FUNCTION "platform"."enforce_oauth_app_cap"() TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "platform"."enforce_oauth_app_cap"() FROM PUBLIC;
