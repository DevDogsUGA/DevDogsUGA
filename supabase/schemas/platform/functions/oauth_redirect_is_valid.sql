CREATE OR REPLACE FUNCTION platform.oauth_redirect_is_valid (
  uri text
)
  RETURNS boolean
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  -- The one redirect rule for every OAuth client (oauth-consent, "Already
  -- settled"): http only for localhost, 127.0.0.1 and [::1] (any port, any
  -- path); https for everything else; no custom schemes; no credentials in the
  -- address. apps/platform/src/server/oauth/redirectRule.ts holds the same two
  -- patterns, and redirectRule.db-test.ts pins the pair to one corpus.
  select uri is not null
    and char_length(uri) <= 2048
    and (
      uri ~* '^http://(localhost|127\.0\.0\.1|\[::1\])(:[0-9]{1,5})?([/?#][^[:space:]]*)?$'
      or uri ~* '^https://[^/?#@:[:space:]]+(:[0-9]{1,5})?([/?#][^[:space:]]*)?$'
    );
$function$;

GRANT EXECUTE ON FUNCTION "platform"."oauth_redirect_is_valid"(text) TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "platform"."oauth_redirect_is_valid"(text) FROM PUBLIC;
