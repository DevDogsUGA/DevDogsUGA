-- Docs move from a GitHub-webhook sync into the build.
--
-- Pages, the sidebar tree and page metadata now come from @devdogsuga/docs,
-- which parses this repo's docs/ folder at build time and is compiled into the
-- bundle. The only thing Postgres still owns is the full-text search index:
-- tsvector + GIN scales with the corpus in a way an in-memory JS index rebuilt
-- on every Worker isolate cold start does not, and ts_headline is the only
-- snippet generator that survives stemming (search "caching", match the stem in
-- "cache", highlight "cache").
--
-- So: docsRepos and docsBranches were pure sync bookkeeping and go away, and
-- docsPages keeps only what the search query reads. It is repopulated by
-- `pnpm docs:index`, which upserts from the same build-time artifact.

-- Existing rows are keyed per branch and carry pre-restructure paths. The
-- indexer rewrites the table wholesale, and the unique index below is on path
-- alone, so clear it first rather than risk cross-branch path collisions.
delete from platform."docsPages";

alter table "platform"."docsPages" drop constraint "docsPages_branchId_fkey";
drop index platform."docsPages_branch_path_idx";

alter table "platform"."docsPages"
    drop column "branchId",
    -- Git blob sha drove incremental sync diffing; there is no sync now.
    drop column "blobSha",
    -- Served from the bundled artifact rather than the database.
    drop column "frontmatter",
    drop column "headings",
    drop column "content";

create unique index "docsPages_path_idx" on platform."docsPages" using btree ("path");

drop table "platform"."docsBranches";
drop table "platform"."docsRepos";
