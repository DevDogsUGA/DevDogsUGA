-- Whitespace-separated words, as the platform's reflectionWordCount counts
-- them (trim, split on runs of whitespace; blank text is zero). The project
-- report check and the EL evidence view share it so the database and the
-- server agree on "at least 100 words".
CREATE OR REPLACE FUNCTION platform.word_count (
  content text
)
  RETURNS integer
  LANGUAGE sql
  IMMUTABLE
  PARALLEL SAFE
  SECURITY INVOKER
  SET search_path TO ''
  AS $function$
  select case
    when btrim(content, E' \t\r\n\f\v') = '' then 0
    else cardinality(regexp_split_to_array(btrim(content, E' \t\r\n\f\v'), '\s+'))
  end;
$function$;

GRANT EXECUTE ON FUNCTION "platform"."word_count"(text) TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "platform"."word_count"(text) FROM PUBLIC;
