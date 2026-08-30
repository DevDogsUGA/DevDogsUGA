-- Documentation full-text search index.
--
-- One table, platform."docsPages", and it is the only part of the docs system
-- Postgres owns. Pages, the sidebar tree and page metadata are parsed out of
-- this repo's docs/ folder at build time by @devdogsuga/docs and compiled into
-- the bundle. The database keeps the search index because tsvector + GIN scales
-- with the corpus in a way an in-memory JS index rebuilt on every Worker
-- isolate cold start does not, and because ts_headline is the only snippet
-- generator that survives stemming: search "caching", match the stem in
-- "cache", highlight "cache".
--
-- Rows arrive only from `pnpm docs:index`, which connects directly to Postgres
-- and so bypasses RLS. That is why the table has one permissive SELECT policy
-- and deliberately no write policies. Do not "complete" the CRUD set.
--
-- The docs used to be synced from a GitHub push webhook, which needed two more
-- tables (docsRepos, docsBranches) and five more columns on this one. None of
-- that reaches the final schema, so none of it is written here.

create table "platform"."docsPages" (
    "id" uuid not null default gen_random_uuid(),
    -- Slash-joined slug below docs/, ".md" stripped. Globally unique, and the
    -- key the indexer upserts on.
    "path" text not null,
    "title" text not null,
    "description" text,
    -- Markdown flattened to plain text. Feeds the tsvector, and ts_headline
    -- reads it back at query time to build snippets.
    "plainText" text not null,
    "updatedAt" timestamp with time zone not null default now(),
    -- Generated, so the indexer writes title/description/plainText and Postgres
    -- recomputes the vector. The weights rank a title hit above a description
    -- hit above a body hit; the 'english' configuration has to match the
    -- websearch_to_tsquery('english', ...) in the search query, or a stemmed
    -- term stops matching.
    "search" tsvector generated always as (
        setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
        setweight(to_tsvector('english', coalesce("description", '')), 'B') ||
        setweight(to_tsvector('english', "plainText"), 'C')
    ) stored
);

alter table "platform"."docsPages" enable row level security;

create unique index "docsPages_pkey" on platform."docsPages" using btree (id);
alter table "platform"."docsPages" add constraint "docsPages_pkey" primary key using index "docsPages_pkey";

-- A bare unique index, not a unique constraint. The indexer's
-- `on conflict (path)` infers this index by column, and generated types read it
-- as an index; promoting it to a constraint changes both.
create unique index "docsPages_path_idx" on platform."docsPages" using btree ("path");

-- GIN over the generated column. Without it every search is a sequential scan
-- that recomputes nothing but still reads every row.
create index "docsPages_search_idx" on platform."docsPages" using gin ("search");

-- Docs are public content: anyone may read, signed in or not.
create policy "docsPages_public_read" on platform."docsPages"
    for select to anon, authenticated using (true);
