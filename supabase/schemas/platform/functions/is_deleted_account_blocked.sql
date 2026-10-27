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

GRANT EXECUTE ON FUNCTION "platform"."is_deleted_account_blocked"(text) TO "postgres", "service_role", "supabase_auth_admin";

REVOKE ALL ON FUNCTION "platform"."is_deleted_account_blocked"(text) FROM PUBLIC, "anon", "authenticated";
