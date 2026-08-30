-- Content dispatch: the two definer functions that reach into a registered
-- app's own tables, the moderator-facing reads over them, and the conformance
-- check an integrating app runs before it writes a line of application code.
--
-- The one thing to know: resolve_content() and apply_content_action() read and
-- write ANY registered app's content as the definer, and neither is callable by
-- a client. The revoke below is what makes that true, and every role it names
-- is load-bearing. PUBLIC holds EXECUTE on every new function, and this
-- schema's default privileges additionally grant it to anon and authenticated
-- by name, so revoking from PUBLIC alone leaves both functions reachable and
-- says nothing about it. The three client-callable functions here gate
-- themselves on canModerate instead.
--
-- This file has to follow the content type registry. list_content_types() is
-- `language sql` over content_types(), whose column list is resolved at CREATE
-- time, and apply_content_action's signature names platform."contentAction".

-- ============================================================
-- Dispatcher
-- ============================================================

-- Returns the content behind (app, type, ref), or null when no such row exists.
--
-- NOT callable by clients. It reads any registered app's content as the
-- definer, so exposing it would turn reporting into a disclosure oracle for
-- private content: ask about a row you cannot see and read its snapshot back.
-- file_report() calls it and stores the snapshot without ever returning it, and
-- a moderator reaches it through inspect_content(), which gates on canModerate.
--
-- A custom "contentResolver" wins when the app registered one, for content a
-- declarative type cannot describe, assembled across several tables say. Its
-- contract is (content_type text, content_ref text) returns jsonb, returning
-- the same shape this does.
create or replace function "platform".resolve_content(
  app_slug text,
  content_type text,
  content_ref text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  app        record;
  ct         record;
  resolver   regprocedure;
  result     jsonb;
  snap_expr  text;
  row_found  boolean;
  author_id  uuid;
  snapshot   text;
begin
  select * into app from "platform"."apps" a where a."slug" = app_slug;
  if not found then
    raise exception 'Unknown app "%"', app_slug;
  end if;

  if app."contentResolver" is not null then
    -- Resolved from its text signature at call time rather than held as a
    -- regprocedure column, because an OID goes stale the moment the function is
    -- dropped and recreated and does not survive dump/restore.
    resolver := to_regprocedure(app."contentResolver");
    if resolver is null then
      raise exception
        'App "%" names a contentResolver that does not exist: %',
        app_slug, app."contentResolver";
    end if;
    execute format('select %s($1, $2)', resolver::regproc)
      into result using content_type, content_ref;
    return result;
  end if;

  select * into ct
  from "platform".content_types() c
  where c."appId" = app."id" and c."contentType" = content_type;

  if not found then
    raise exception 'App "%" has no content type "%"', app_slug, content_type;
  end if;

  -- Derivation returns misconfigured types rather than hiding them, so these
  -- are the two ways a type can exist but be unusable.
  if ct."refColumn" is null then
    raise exception
      'Content type "%" in app "%" has no single-column primary key, so a content reference cannot address a row',
      content_type, app_slug;
  end if;
  if ct."authorColumn" is null then
    raise exception
      'Content type "%" in app "%" has no unambiguous foreign key to auth.users; set "authorColumn" in platform."contentTypes"',
      content_type, app_slug;
  end if;

  -- Identifiers only, quoted with %I. The validation trigger on
  -- platform."contentTypes" already refused any name that is not a real column,
  -- so this cannot be reached with an expression in it.
  select string_agg(format('t.%I::text', col), ', ' order by ord)
    into snap_expr
    from unnest(ct."snapshotColumns") with ordinality as u(col, ord);

  execute format(
    'select true, t.%I::text, left(concat_ws(%L, %s), 5000) from %I.%I t where t.%I::text = $1',
    ct."authorColumn",
    E'\n\n',
    coalesce(snap_expr, 'null'),
    ct."schemaName", ct."tableName", ct."refColumn"
  ) into row_found, author_id, snapshot using content_ref;

  if not coalesce(row_found, false) then
    return null;
  end if;

  return jsonb_build_object(
    'appId',         app."id",
    'appSlug',       app_slug,
    'contentType',   ct."contentType",
    'contentRef',    content_ref,
    'label',         ct."label",
    'authorUserId',  author_id,
    'snapshot',      snapshot,
    'url',           case
                       when ct."urlTemplate" is not null
                       then replace(ct."urlTemplate", '{ref}', content_ref)
                     end,
    'visibility',    ct."visibility",
    'quarantinable', ct."quarantineColumn" is not null
  );
end;
$$;

-- Carries a moderation decision into the app's own data.
--
-- Raises rather than returning quietly when the type cannot be quarantined, and
-- runs inside the resolution transaction, so a broken setup aborts the decision
-- and surfaces to the moderator. The alternative, recording an outcome whose
-- effect silently never landed, is the exact failure mode of the webhook
-- delivery this replaces.
--
-- NOT callable by clients: it writes any registered app's content as the
-- definer.
create or replace function "platform".apply_content_action(
  app_slug text,
  content_type text,
  content_ref text,
  action "platform"."contentAction",
  resolution_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  app      record;
  ct       record;
  actioner regprocedure;
  affected integer;
begin
  if action = 'no_action' then
    return;
  end if;

  select * into app from "platform"."apps" a where a."slug" = app_slug;
  if not found then
    raise exception 'Unknown app "%"', app_slug;
  end if;

  -- The escape hatch for a quarantine that means something non-trivial:
  -- cascading from a resource to its comments, or a soft-delete spanning
  -- tables. Contract:
  -- (content_type text, content_ref text, action platform."contentAction", resolution_id uuid).
  if app."contentActioner" is not null then
    actioner := to_regprocedure(app."contentActioner");
    if actioner is null then
      raise exception
        'App "%" names a contentActioner that does not exist: %',
        app_slug, app."contentActioner";
    end if;
    execute format('select %s($1, $2, $3, $4)', actioner::regproc)
      using content_type, content_ref, action, resolution_id;
    return;
  end if;

  select * into ct
  from "platform".content_types() c
  where c."appId" = app."id" and c."contentType" = content_type;

  if not found then
    raise exception 'App "%" has no content type "%"', app_slug, content_type;
  end if;

  if ct."quarantineColumn" is null then
    raise exception
      'Content type "%" in app "%" cannot be quarantined: "%"."%" has no foreign key to platform."reportResolutions". Add one, or resolve with a different content action.',
      content_type, app_slug, ct."schemaName", ct."tableName";
  end if;
  if ct."refColumn" is null then
    raise exception
      'Content type "%" in app "%" has no single-column primary key, so a content reference cannot address a row',
      content_type, app_slug;
  end if;

  execute format(
    'update %I.%I set %I = $1 where %I::text = $2',
    ct."schemaName", ct."tableName", ct."quarantineColumn", ct."refColumn"
  ) using resolution_id, content_ref;

  get diagnostics affected = row_count;
  if affected = 0 then
    raise exception
      'No % with reference % exists in app "%"; nothing was quarantined',
      content_type, content_ref, app_slug;
  end if;
end;
$$;

-- `from public, anon, authenticated`, and all three names are load-bearing.
-- PUBLIC holds EXECUTE on every function by default, and platform's default
-- privileges additionally grant it to anon and authenticated by name, so
-- revoking one of the three leaves both functions reachable by the other two
-- and raises nothing. The same note sits over the revokes in the content type
-- registry file.
--
-- Without this, resolve_content is a disclosure oracle for every registered
-- app's private content, and apply_content_action lets any signed-in user
-- quarantine anything.
revoke execute on function "platform".resolve_content(text, text, text)
  from public, anon, authenticated;
revoke execute on function
  "platform".apply_content_action(text, text, text, "platform"."contentAction", uuid)
  from public, anon, authenticated;

-- ============================================================
-- Moderator surface
-- ============================================================

-- What the catalog detected for an app: which tables are content types, what
-- the derivation produced for each, and which of them support quarantine. This
-- is what the tools page shows and what the conformance check reads.
--
-- Client-callable, and it gates itself in the WHERE clause rather than raising,
-- so a caller without canModerate gets an empty set. The columns mirror
-- content_types() exactly; adding one there means recreating this signature and
-- everything that calls it.
create or replace function "platform".list_content_types(app_slug text default null)
returns table (
  "appId"            uuid,
  "appSlug"          text,
  "schemaName"       text,
  "tableName"        text,
  "contentType"      text,
  "label"            text,
  "refColumn"        text,
  "authorColumn"     text,
  "snapshotColumns"  text[],
  "urlTemplate"      text,
  "visibility"       "platform"."contentVisibility",
  "quarantineColumn" text
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.*
  from "platform".content_types() c
  where "platform".has_permission((select auth.uid()), 'canModerate')
    and (app_slug is null or c."appSlug" = app_slug)
  order by c."appSlug", c."contentType";
$$;

-- The privileged refetch: live content behind a report, for a moderator
-- deciding whether it still says what the snapshot says it did.
create or replace function "platform".inspect_content(
  app_slug text,
  content_type text,
  content_ref text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not "platform".has_permission((select auth.uid()), 'canModerate') then
    raise exception 'inspect_content() requires the canModerate permission';
  end if;
  return "platform".resolve_content(app_slug, content_type, content_ref);
end;
$$;

-- ============================================================
-- Conformance check
-- ============================================================
--
-- "Did I declare my content correctly?" Successor to the old
-- "Connect, send report.ping" button, which verified that a URL answered. This
-- verifies the contract instead, and it does so before an integrating app has
-- written any application code.
--
-- The checks are chosen by what actually goes wrong:
--
--   * quarantine_protected catches the most dangerous mistake, and one that
--     leaves no trace. Column privileges do not subtract from table-level ones,
--     so the obvious `revoke update ("quarantinedBy") ...` does nothing at all
--     while a table-wide UPDATE grant exists, and every app schema has one via
--     `alter default privileges`. An author can then clear their own
--     quarantine, and has_column_privilege() is the only thing that will say so.
--
--   * read_policy_filters_quarantine and write_policy_freezes_quarantine catch
--     the mistake that is easiest to make. Quarantine is the only moderation
--     outcome whose effect lives in the app's own policies, so it is the only
--     one that can be wired up wrong while everything appears to work: the
--     platform records the decision, sets the column, and has no way to notice
--     nobody reads it. Which of the two runs depends on the type's declared
--     "quarantineEffect", because hiding a profile row is not available even in
--     principle and a check that cries wolf on the reference implementation is
--     worse than no check.
--
-- Those are heuristics over policy text, not proofs, and their details say so.
-- A policy that filters quarantined rows through a helper function reads as a
-- failure here. That is the right way round: a false alarm gets looked at and a
-- false pass does not.
--
-- The body lives under the name conformance_report, and the thin `returns
-- table` wrapper below is what clients call. It is created under that name
-- outright: the earlier history built it as conformance_check() and renamed it
-- later, so a reader looking for the rename will not find one. The raise
-- message inside still names conformance_check(), because that is the entry
-- point the caller used.
create or replace function "platform".conformance_report(app_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  app     record;
  ct      record;
  results jsonb := '[]'::jsonb;
  checks  jsonb;
  rel     regclass;
  sample  text;
  resolved jsonb;
  ok      boolean;
  detail  text;
  effect  "platform"."quarantineEffect";
begin
  if not "platform".has_permission((select auth.uid()), 'canModerate') then
    raise exception 'conformance_check() requires the canModerate permission';
  end if;

  select * into app from "platform"."apps" a where a."slug" = app_slug;
  if not found then
    raise exception 'Unknown app "%"', app_slug;
  end if;

  for ct in
    select * from "platform".content_types() c where c."appId" = app."id"
    order by c."contentType"
  loop
    checks := '[]'::jsonb;
    rel := (quote_ident(ct."schemaName") || '.' || quote_ident(ct."tableName"))::regclass;

    -- Read straight from the override table rather than through
    -- content_types(): adding a column to a `returns table` signature means
    -- dropping and recreating it, and every function that calls it, for a value
    -- only this check consults.
    select coalesce(o."quarantineEffect", 'hide')
      into effect
      from "platform"."contentTypes" o
     where o."appId" = ct."appId" and o."tableName" = ct."tableName";
    effect := coalesce(effect, 'hide');

    -- 1. Addressable
    checks := checks || jsonb_build_object(
      'name', 'ref_column',
      'ok', ct."refColumn" is not null,
      'detail', coalesce(
        'Rows are addressed by "' || ct."refColumn" || '".',
        'No single-column primary key, so a content reference cannot name a row.'
      )
    );

    -- 2. Attributable
    checks := checks || jsonb_build_object(
      'name', 'author_column',
      'ok', ct."authorColumn" is not null,
      'detail', coalesce(
        'Reports will be filed against "' || ct."authorColumn" || '".',
        'No unambiguous foreign key to auth.users. Set "authorColumn" in platform."contentTypes".'
      )
    );

    -- 3. Resolvable -- against a real row, if there is one.
    ok := false;
    detail := null;
    if ct."refColumn" is not null and ct."authorColumn" is not null then
      begin
        execute "pg_catalog".format(
          'select t.%I::text from %I.%I t limit 1',
          ct."refColumn", ct."schemaName", ct."tableName"
        ) into sample;

        if sample is null then
          detail := 'No rows to test against. Seed some content and run this again.';
        else
          resolved := "platform".resolve_content(app_slug, ct."contentType", sample);
          ok := resolved is not null;
          detail := case
            when ok then 'Resolved a sample row, snapshotting ' ||
                         coalesce(array_length(ct."snapshotColumns", 1), 0)::text ||
                         ' column(s).'
            else 'resolve_content() found no row for a reference taken from the table itself.'
          end;
        end if;
      exception when others then
        detail := 'resolve_content() raised: ' || sqlerrm;
      end;
    else
      detail := 'Skipped: the type is not addressable or not attributable.';
    end if;
    checks := checks || jsonb_build_object(
      'name', 'resolve', 'ok', ok, 'detail', detail
    );

    -- 4/5. Quarantine, and whether clients can tamper with it.
    if ct."quarantineColumn" is null then
      checks := checks || jsonb_build_object(
        'name', 'quarantine',
        'ok', true,
        'detail', 'Not quarantinable. Reports resolve by acting on the user instead.'
      );
    else
      checks := checks || jsonb_build_object(
        'name', 'quarantine',
        'ok', true,
        'detail', 'Quarantine ' || effect::text || 's, writing to "' ||
                  ct."quarantineColumn" || '".'
      );

      ok := not (
        "pg_catalog".has_column_privilege('authenticated', rel, ct."quarantineColumn", 'UPDATE')
        or "pg_catalog".has_column_privilege('anon', rel, ct."quarantineColumn", 'UPDATE')
      );
      checks := checks || jsonb_build_object(
        'name', 'quarantine_protected',
        'ok', ok,
        'detail', case when ok
          then 'Clients cannot write "' || ct."quarantineColumn" || '".'
          else 'Clients CAN write "' || ct."quarantineColumn" ||
               '", so an author can un-hide their own content. Column-level REVOKE does not ' ||
               'override a table-wide UPDATE grant -- revoke UPDATE on the table, then grant it back per column.'
        end
      );

      -- The effect-dependent half. Both are heuristics over policy text, and
      -- both are the same heuristic pointed at a different command: whichever
      -- policy is supposed to ACT on the column had better mention it.
      if effect = 'hide' then
        ok := exists (
          select 1 from "pg_catalog".pg_policy p
          where p.polrelid = rel
            and p.polcmd in ('r', '*')
            and "pg_catalog".pg_get_expr(p.polqual, p.polrelid) like '%' || ct."quarantineColumn" || '%'
        );
        checks := checks || jsonb_build_object(
          'name', 'read_policy_filters_quarantine',
          'ok', ok,
          'detail', case when ok
            then 'A read policy references "' || ct."quarantineColumn" || '".'
            else 'No read policy mentions "' || ct."quarantineColumn" ||
                 '". Quarantined content would stay visible: the platform sets the column, ' ||
                 'but only your policies can act on it. If quarantine is meant to freeze ' ||
                 'rather than hide this type, say so with "quarantineEffect" in platform."contentTypes".'
          end
        );
      else
        ok := exists (
          select 1 from "pg_catalog".pg_policy p
          where p.polrelid = rel
            and p.polcmd in ('w', '*')
            and "pg_catalog".pg_get_expr(p.polqual, p.polrelid) like '%' || ct."quarantineColumn" || '%'
        );
        checks := checks || jsonb_build_object(
          'name', 'write_policy_freezes_quarantine',
          'ok', ok,
          'detail', case when ok
            then 'An update policy references "' || ct."quarantineColumn" ||
                 '", so a quarantined row stops being editable.'
            else 'This type declares quarantineEffect = ''freeze'', but no update policy mentions "' ||
                 ct."quarantineColumn" || '". The author could edit the content straight back, ' ||
                 'and rewrite the evidence a moderator is looking at.'
          end
        );
      end if;
    end if;

    -- 6. Heuristic: do write policies consult the cross-app ban?
    ok := exists (
      select 1 from "pg_catalog".pg_policy p
      where p.polrelid = rel
        and p.polcmd in ('a', 'w', '*')
        and coalesce(
          "pg_catalog".pg_get_expr(p.polwithcheck, p.polrelid), ''
        ) || coalesce(
          "pg_catalog".pg_get_expr(p.polqual, p.polrelid), ''
        ) like '%is_suspended%'
    );
    checks := checks || jsonb_build_object(
      'name', 'write_policy_checks_suspension',
      'ok', ok,
      'detail', case when ok
        then 'Write policies call platform.is_suspended().'
        else 'No write policy calls platform.is_suspended(), so a DevDogs suspension will not stop writes here.'
      end
    );

    results := results || jsonb_build_object(
      'contentType', ct."contentType",
      'tableName', ct."schemaName" || '.' || ct."tableName",
      'checks', checks
    );
  end loop;

  return results;
end;
$$;

-- Revoked from all three roles for the same reason as the dispatcher: this half
-- interrogates the catalog of every registered app. Clients reach it only
-- through the wrapper, which is a permission check away.
revoke execute on function "platform".conformance_report(text)
  from public, anon, authenticated;

-- The outer row gets columns; `checks` stays jsonb because it is a list of
-- {name, ok, detail} objects, which is genuinely nested rather than tabular.
-- The permission check is repeated here rather than left to conformance_report,
-- because this is the function a client can actually reach.
create or replace function "platform".conformance_check(app_slug text)
returns table ("contentType" text, "tableName" text, "checks" jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  rec record;
begin
  if not "platform".has_permission((select auth.uid()), 'canModerate') then
    raise exception 'conformance_check() requires the canModerate permission';
  end if;

  for rec in
    select
      e.value ->> 'contentType' as ct,
      e.value ->> 'tableName'   as tn,
      e.value -> 'checks'       as ck
    from jsonb_array_elements("platform".conformance_report(app_slug)) as e(value)
  loop
    "contentType" := rec.ct;
    "tableName"   := rec.tn;
    "checks"      := rec.ck;
    return next;
  end loop;
end;
$$;
