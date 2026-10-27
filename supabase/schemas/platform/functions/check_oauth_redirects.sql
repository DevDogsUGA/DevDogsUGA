CREATE OR REPLACE FUNCTION platform.check_oauth_redirects()
  RETURNS void
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  bad record;
begin
  -- GoTrue stores a client's redirect URIs as one comma-separated string. A
  -- registered, live client with an address the redirect rule refuses fails the
  -- migration that runs this, loudly, with the client and the address.
  select r."clientId" as client_id, trim(u.uri) as uri
    into bad
    from "platform"."oauthRegistrations" r
    join "auth"."oauth_clients" c on c.id = r."clientId" and c.deleted_at is null
    cross join lateral unnest(string_to_array(c.redirect_uris, ',')) as u(uri)
   where not "platform".oauth_redirect_is_valid(trim(u.uri))
   limit 1;
  if found then
    raise exception 'OAuth client % has a redirect URI the redirect rule refuses: %',
      bad.client_id, bad.uri
      using errcode = '23514';
  end if;
end;
$function$;

GRANT EXECUTE ON FUNCTION "platform"."check_oauth_redirects"() TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "platform"."check_oauth_redirects"() FROM PUBLIC;
