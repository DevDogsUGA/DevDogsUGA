-- Whitespace-separated words, as the platform's reflectionWordCount counts
-- them (JS \s: ASCII whitespace plus NBSP, the U+2000 spaces, line and
-- paragraph separators, U+3000 and the BOM; blank text is zero). The project
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
  select cardinality(array_remove(
    regexp_split_to_array(
      content,
      E'[\\t\\n\\v\\f\\r \\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff]+'
    ),
    ''
  ));
$function$;

GRANT EXECUTE ON FUNCTION "platform"."word_count"(text) TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "platform"."word_count"(text) FROM PUBLIC;
