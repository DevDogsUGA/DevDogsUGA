-- `platform.replace_docs_index(pages jsonb)`: the one write path for the docs
-- search index.
--
-- `docs-kit index` (packages/docs-kit) used to be `devtools docs index`, which
-- opened a direct Postgres connection and ran its own transaction from the
-- client. This moves the transaction into the database, so the indexer is a
-- single typed RPC call that works on any tier through the API URL and
-- service key `with-env` already loads, and needs no connection string.
--
-- In one transaction it upserts every page by `path`, deletes the rows whose
-- path is gone, and records a hash of what it was given. A call whose hash
-- matches the stored one (and whose row count still agrees, so a table someone
-- emptied is refilled rather than trusted) writes nothing and returns false.
-- The dev server calls it after every docs change, and most changes touch no
-- page text the index holds.
--
-- `pages` is an array of {path, title, description, plainText, publishAt}.
-- An empty array is refused: it would delete the whole index, and an empty docs
-- build is always a broken build, never an intent.

create table "platform"."docsIndexState" (
    -- A one-row table. The check is what pins it to one row.
    "id" boolean not null default true check ("id"),
    "hash" text not null,
    "updatedAt" timestamp with time zone not null default now(),
    constraint "docsIndexState_pkey" primary key ("id")
);

-- Like docsPages' write side: only the service role (which bypasses RLS) ever
-- touches it, so there is deliberately no policy at all.
alter table "platform"."docsIndexState" enable row level security;

create function "platform".replace_docs_index(pages jsonb)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  new_hash text;
  page_count integer;
begin
  if jsonb_typeof(pages) is distinct from 'array' then
    raise exception 'replace_docs_index: pages must be a json array';
  end if;

  page_count := jsonb_array_length(pages);
  if page_count = 0 then
    raise exception 'replace_docs_index: refusing to replace the index with no pages';
  end if;

  -- jsonb text is canonical (sorted keys, normalized whitespace), so the same
  -- pages always hash the same however the client serialized them.
  new_hash := encode(sha256(convert_to(pages::text, 'UTF8')), 'hex');

  if exists (select 1 from "platform"."docsIndexState" where "hash" = new_hash)
     and (select count(*) from "platform"."docsPages") = page_count then
    return false;
  end if;

  insert into "platform"."docsPages" ("path", "title", "description", "plainText", "publishAt")
  select p."path", p."title", p."description", p."plainText", p."publishAt"
  from jsonb_to_recordset(pages) as p(
    "path" text,
    "title" text,
    "description" text,
    "plainText" text,
    "publishAt" timestamp with time zone
  )
  on conflict ("path") do update set
    "title" = excluded."title",
    "description" = excluded."description",
    "plainText" = excluded."plainText",
    "publishAt" = excluded."publishAt",
    "updatedAt" = now()
  where ("docsPages"."title", "docsPages"."description", "docsPages"."plainText", "docsPages"."publishAt")
    is distinct from (excluded."title", excluded."description", excluded."plainText", excluded."publishAt");

  delete from "platform"."docsPages"
  where "path" not in (
    select p."path" from jsonb_to_recordset(pages) as p("path" text)
  );

  insert into "platform"."docsIndexState" ("id", "hash")
  values (true, new_hash)
  on conflict ("id") do update set "hash" = excluded."hash", "updatedAt" = now();

  return true;
end;
$$;

-- Postgres grants EXECUTE to PUBLIC by default, and this schema's default
-- privileges grant it to anon and authenticated too (file 00). The schema is
-- exposed through PostgREST, so without this anyone could replace the index.
-- Only the service role may call it.
revoke execute on function "platform".replace_docs_index(jsonb)
  from public, anon, authenticated;
grant execute on function "platform".replace_docs_index(jsonb) to service_role;
