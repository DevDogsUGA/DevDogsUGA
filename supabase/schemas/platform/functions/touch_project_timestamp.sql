CREATE OR REPLACE FUNCTION platform.touch_project_timestamp()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  new."updatedAt" := now();
  return new;
end;
$function$;

GRANT EXECUTE ON FUNCTION platform.touch_project_timestamp() TO "postgres", "service_role";

REVOKE ALL ON FUNCTION platform.touch_project_timestamp() FROM PUBLIC, "anon", "authenticated";
