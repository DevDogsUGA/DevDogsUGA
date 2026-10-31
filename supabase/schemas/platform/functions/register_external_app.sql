CREATE OR REPLACE FUNCTION platform.register_external_app (
  p_slug          text,
  p_display_name  text,
  p_client_id     uuid,
  p_endpoint_url  text,
  p_content_types jsonb
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  app_id uuid;
  ct     jsonb;
begin
  if p_slug !~ '^[a-z][a-z0-9-]{1,40}$' then
    raise exception 'moderation:invalid_request';
  end if;
  if jsonb_typeof(p_content_types) is distinct from 'array'
     or jsonb_array_length(p_content_types) = 0 then
    raise exception 'moderation:invalid_request';
  end if;

  -- A client GoTrue has soft-deleted (`deleted_at`) is gone for good, and one
  -- with no registration row was made outside /settings/oauth and has no tier. Both
  -- would be registered as a production app they can never prove they are.
  if exists (
    select 1 from "auth"."oauth_clients" c
    where c."id" = p_client_id and c."deleted_at" is not null
  ) then
    raise exception 'moderation:client_deleted';
  end if;

  case platform.moderation_client_tier(p_client_id)
    when 'production' then null;
    when 'development' then raise exception 'moderation:development_client';
    else raise exception 'moderation:client_unregistered';
  end case;

  select a."id" into app_id from "platform"."apps" a where a."slug" = p_slug;
  if found then
    if exists (select 1 from "platform"."apps" a where a."id" = app_id and a."kind" <> 'external') then
      raise exception 'App "%" is a platform app, not an external one', p_slug;
    end if;
    update "platform"."apps" set "displayName" = p_display_name where "id" = app_id;
  else
    insert into "platform"."apps" ("slug", "displayName", "kind")
    values (p_slug, p_display_name, 'external')
    returning "id" into app_id;
  end if;

  update "platform"."moderationClients"
  set "appId" = null, "updatedAt" = now()
  where "appId" = app_id and "clientId" <> p_client_id;

  insert into "platform"."moderationClients" ("clientId", "appId", "endpointUrl")
  values (p_client_id, app_id, p_endpoint_url)
  on conflict ("clientId") do update
    set "appId" = excluded."appId",
        "endpointUrl" = excluded."endpointUrl",
        "updatedAt" = now();

  delete from "platform"."externalContentTypes" t
  where t."appId" = app_id
    and t."contentType" not in (
      select e ->> 'contentType' from jsonb_array_elements(p_content_types) e
    );

  for ct in select * from jsonb_array_elements(p_content_types) loop
    insert into "platform"."externalContentTypes" ("appId", "contentType", "label", "urlTemplate")
    values (app_id, ct ->> 'contentType', ct ->> 'label', ct ->> 'urlTemplate')
    on conflict ("appId", "contentType") do update
      set "label" = excluded."label", "urlTemplate" = excluded."urlTemplate";
  end loop;

  return app_id;
end;
$function$;

GRANT EXECUTE ON FUNCTION "platform"."register_external_app"(text, text, uuid, text, jsonb) TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "platform"."register_external_app"(text, text, uuid, text, jsonb) FROM PUBLIC;
