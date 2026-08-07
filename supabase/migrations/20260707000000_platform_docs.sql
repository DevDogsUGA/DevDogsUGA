-- Documentation content ingested from GitHub. GitHub is a write-time-only
-- dependency: a push webhook syncs docs/**/*.md into these tables, and all
-- reads (pages, sidebar tree, full-text search) come from here.

create table "platform"."docsRepos" (
    "id" uuid not null default gen_random_uuid(),
    "slug" text not null,
    "name" text not null,
    "description" text,
    "defaultBranch" text not null default 'main',
    "sortOrder" integer not null default 0,
    "createdAt" timestamp with time zone not null default now()
);

alter table "platform"."docsRepos" enable row level security;

create unique index "docsRepos_pkey" on platform."docsRepos" using btree (id);
alter table "platform"."docsRepos" add constraint "docsRepos_pkey" primary key using index "docsRepos_pkey";
create unique index "docsRepos_slug_idx" on platform."docsRepos" using btree (slug);

create table "platform"."docsBranches" (
    "id" uuid not null default gen_random_uuid(),
    "repoId" uuid not null,
    -- Branch names may contain "/" (e.g. docs/preview-x); URL resolution
    -- longest-prefix matches against this column.
    "name" text not null,
    "lastSyncedCommit" text,
    "lastSyncedAt" timestamp with time zone
);

alter table "platform"."docsBranches" enable row level security;

create unique index "docsBranches_pkey" on platform."docsBranches" using btree (id);
alter table "platform"."docsBranches" add constraint "docsBranches_pkey" primary key using index "docsBranches_pkey";
create unique index "docsBranches_repo_name_idx" on platform."docsBranches" using btree ("repoId", "name");
alter table "platform"."docsBranches" add constraint "docsBranches_repoId_fkey"
    foreign key ("repoId") references platform."docsRepos"(id) on delete cascade;

create table "platform"."docsPages" (
    "id" uuid not null default gen_random_uuid(),
    "branchId" uuid not null,
    -- Slash-joined slug below the repo's docs/ directory, ".md" stripped.
    "path" text not null,
    -- Git blob sha of the source file; drives incremental sync diffing.
    "blobSha" text not null,
    "title" text not null,
    "description" text,
    "frontmatter" jsonb not null default '{}'::jsonb,
    -- [{ id, title, depth }] for the table of contents.
    "headings" jsonb not null default '[]'::jsonb,
    -- Raw markdown with frontmatter stripped.
    "content" text not null,
    -- Markdown flattened to plain text; feeds the tsvector and snippets.
    "plainText" text not null,
    "updatedAt" timestamp with time zone not null default now(),
    "search" tsvector generated always as (
        setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
        setweight(to_tsvector('english', coalesce("description", '')), 'B') ||
        setweight(to_tsvector('english', "plainText"), 'C')
    ) stored
);

alter table "platform"."docsPages" enable row level security;

create unique index "docsPages_pkey" on platform."docsPages" using btree (id);
alter table "platform"."docsPages" add constraint "docsPages_pkey" primary key using index "docsPages_pkey";
create unique index "docsPages_branch_path_idx" on platform."docsPages" using btree ("branchId", "path");
create index "docsPages_search_idx" on platform."docsPages" using gin ("search");
alter table "platform"."docsPages" add constraint "docsPages_branchId_fkey"
    foreign key ("branchId") references platform."docsBranches"(id) on delete cascade;

-- Docs are public content: anyone may read. There are intentionally no write
-- policies — ingestion happens over the server's direct DB connection.
create policy "docsRepos_public_read" on platform."docsRepos"
    for select to anon, authenticated using (true);
create policy "docsBranches_public_read" on platform."docsBranches"
    for select to anon, authenticated using (true);
create policy "docsPages_public_read" on platform."docsPages"
    for select to anon, authenticated using (true);

-- Seed the tracked repositories (previously the Edge Config "docs" key).
insert into platform."docsRepos" ("slug", "name", "description", "defaultBranch", "sortOrder")
values ('DevDogs-Website', 'DevDogs Website', 'The devdogsuga.org web platform.', 'main', 0);
