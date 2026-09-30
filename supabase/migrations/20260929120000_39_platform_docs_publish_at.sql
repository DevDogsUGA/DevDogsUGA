-- Scheduled docs pages: when a page becomes visible.
--
-- A docs page (or the folder it sits in) can carry `scheduled: <ISO time>`, and
-- until then nothing about it is shown: not the page, not its place in the
-- sidebar, and not a search hit. The compiler emits the resolved time as
-- `publishAt` and `devtools docs index` writes it here, so the search index can
-- honour it without a redeploy.
--
-- Null means "always visible", which is every row that exists today, so the
-- column needs no backfill.
alter table "platform"."docsPages"
  add column "publishAt" timestamp with time zone;

-- The read policy used to be `using (true)`, which was accurate while every
-- indexed page was public. The table is also reachable through PostgREST with
-- the anon key, so a page still ahead of its time would be readable there,
-- title and full text, however carefully the platform's own search hides it.
-- The policy is the boundary, so it carries the same rule the search query does.
-- The platform's server connection is the table owner and bypasses RLS; it
-- filters explicitly (see `searchDocs`).
drop policy "docsPages_public_read" on "platform"."docsPages";

create policy "docsPages_public_read" on "platform"."docsPages"
  for select to anon, authenticated
  using ("publishAt" is null or "publishAt" <= now());
