CREATE OR REPLACE FUNCTION platform.moderation_client_tier (
  p_client_id uuid
)
  RETURNS text
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  -- The moderation API still speaks in tiers: 'production' for an app that is
  -- In production, 'development' for one in Testing, null for a client nobody
  -- registered. The answer comes from the publishing status; the retired "tier"
  -- column is not read.
  select case r.status
           when 'in_production'::platform."oauthStatus" then 'production'
           else 'development'
         end
    from "platform"."oauthRegistrations" r
   where r."clientId" = p_client_id;
$function$;

GRANT EXECUTE ON FUNCTION "platform"."moderation_client_tier"(uuid) TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "platform"."moderation_client_tier"(uuid) FROM PUBLIC;
