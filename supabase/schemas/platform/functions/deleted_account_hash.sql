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

GRANT EXECUTE ON FUNCTION "platform"."deleted_account_hash"(text) TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "platform"."deleted_account_hash"(text) FROM PUBLIC, "anon", "authenticated";
