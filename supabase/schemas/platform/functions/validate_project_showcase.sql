CREATE OR REPLACE FUNCTION platform.validate_project_showcase()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  if cardinality(new.tags) > 20 or exists (
    select 1 from unnest(new.tags) t where t is null or t <> btrim(t) or char_length(t) not between 1 and 40
  ) or (select count(distinct t) from unnest(new.tags) t) <> cardinality(new.tags) then
    raise exception 'Invalid project tags';
  end if;
  if new."iconKey" is not null and new."iconKey" not in ('HouseIcon','DogDaysIcon','DogPackIcon','MagnifyingGlassIcon','dogdays','dogpack') then
    raise exception 'Invalid icon registry key';
  end if;
  if new."colorKey" is not null and new."colorKey" not in ('foreground','cyan-400','red-600','red-700','purple-500','emerald-400') then
    raise exception 'Invalid color registry key';
  end if;
  return new;
end;
$function$;

GRANT EXECUTE ON FUNCTION platform.validate_project_showcase() TO "postgres", "service_role";

REVOKE ALL ON FUNCTION platform.validate_project_showcase() FROM PUBLIC, "anon", "authenticated";
