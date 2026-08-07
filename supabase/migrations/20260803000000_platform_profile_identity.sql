-- Durable member identity, separate from current-roster status.
--
-- The Involvement CSV import already brings a legal name and a UGA email into
-- the database, but it stores both in a shape that cannot be pushed anywhere:
--
--   * The UGA email lands in `auth.users.email` -- the same column that holds a
--     Gmail address for anyone who signed up with Google or Discord before ever
--     appearing on a roster. Nothing marks an address as institutional, so a
--     sync keyed on it would key on whatever the member happened to sign up
--     with.
--
--   * `involvement*` is deliberately transient. The import opens by nulling
--     `involvementFirstName` / `involvementLastName` / `involvementImportedAt`
--     across every row, then repopulates from the CSV. That is correct for what
--     those columns are FOR -- they answer "is this person on the CURRENT
--     roster", a verification signal that should go false when somebody drops
--     off -- but it makes them unusable as a name of record.
--
-- The second point is the one that would have caused real damage. Pushing
-- `involvement*` to Airtable as "legal name" would blank the field for every
-- member who graduated, took a semester off, or was simply missing from one
-- CSV, and blanking a dues record's name is silent, hard-to-notice loss.
--
-- Hence two sets of columns on one table, which will otherwise read as
-- duplication:
--
--   | Columns              | Question answered               | Cleared on import? |
--   | -------------------- | ------------------------------- | ------------------ |
--   | involvement*         | Are they on the CURRENT roster  | Yes -- by design   |
--   | legal*, ugaEmail     | Who is this person, durably     | Never              |

alter table "platform"."profile"
  add column "ugaEmail"          text,
  add column "legalFirstName"    text,
  add column "legalLastName"     text,
  add column "identitySourcedAt" timestamptz;

comment on column "platform"."profile"."ugaEmail" is
  'Institutional address from the Involvement roster. Durable identity: never cleared by an import. Distinct from auth.users.email, which is whatever the member signed up with.';

comment on column "platform"."profile"."legalFirstName" is
  'Name of record from the Involvement roster. Never cleared by an import -- see "involvementFirstName" for current-roster status.';

comment on column "platform"."profile"."legalLastName" is
  'Name of record from the Involvement roster. Never cleared by an import -- see "involvementLastName" for current-roster status.';

comment on column "platform"."profile"."identitySourcedAt" is
  'When a roster import last confirmed the durable identity columns. Unlike "involvementImportedAt" this is not reset when a member is absent from an import.';

-- Case-folded rather than case-sensitive: MyID addresses are handed out in one
-- case but typed in another, and two spellings of one address would become two
-- member rows in Airtable. `citext` would express this directly, but it is an
-- extension type (`extensions.citext` under Supabase's layout) and drizzle-kit
-- cannot introspect it into the generated schema. A check constraint plus a
-- plain unique index gives the identical guarantee in types Drizzle already
-- understands; the import lowercases before writing either way.
alter table "platform"."profile"
  add constraint "profile_ugaEmail_lowercase"
  check ("ugaEmail" is null or "ugaEmail" = lower("ugaEmail"));

create unique index "profile_ugaEmail_key"
  on "platform"."profile" ("ugaEmail");

-- ============================================================
-- Keep clients out of the identity columns
-- ============================================================
--
-- `platform.profile` is written directly from the browser through PostgREST --
-- the account page updates preferredName, bio, pronouns, roleDescription and
-- the show* flags that way -- and its UPDATE policy is a permissive
-- `auth.uid() = "userId"`. That policy is about WHICH ROW, not which columns,
-- so without this a member could set their own `ugaEmail` or `legal*` and
-- rewrite the identity a dues record is keyed on.
--
-- Column-level grants are the mechanism, and they only work in one direction:
-- a `revoke update ("ugaEmail") ...` against a table-wide UPDATE grant does
-- nothing at all. The table-wide grant has to go first, then come back per
-- column. (Migration 20260730000005 asserts this same shape for app schemas.)
revoke update on "platform"."profile" from authenticated, anon;

-- Exactly the columns that were client-writable before this migration, so
-- behaviour is unchanged for everything except the four added above.
--
-- Two of these are arguably too generous already: "graduationSemester" /
-- "graduationYear" are only ever written by updateGraduation.ts, which
-- validates that the date is in the future, and a direct PostgREST write skips
-- that. Narrowing them is a separate change from this one.
grant update (
  "preferredName",
  "bio",
  "pronouns",
  "graduationSemester",
  "graduationYear",
  "showGithub",
  "showDiscord",
  "showEmail",
  "showLinkedin",
  "viewedConsole",
  "roleDescription"
) on "platform"."profile" to authenticated;
