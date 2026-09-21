-- Give a competition a title of its own.
--
-- A competition had no name in the schema: every page derived one from the
-- opening workshop's title, which in turn fell back to the linked project's
-- display name and finally to the branch slug. Officers now name the week
-- directly in Airtable's Competitions table, and this column stores it.
--
-- Nullable, and null keeps the old behaviour exactly: the loaders coalesce this
-- ahead of the workshop title, so every competition authored before this column
-- renders as it always did. The length check mirrors `workshops_title_length` --
-- both are row/page headings, short by design -- and the Airtable pull refuses a
-- longer value rather than truncating it, leaving the published title in place.

alter table "platform"."competitions"
  add column "title" text;

alter table "platform"."competitions"
  add constraint "competitions_title_length"
  check ("title" is null or char_length("title") <= 80);

comment on column "platform"."competitions"."title" is
  'What the officers call this competition on its own pages, in their own words. Null falls back to the opening workshop''s title, then the project''s display name, then the branch slug, so a competition authored before this column keeps rendering exactly as it did.';
