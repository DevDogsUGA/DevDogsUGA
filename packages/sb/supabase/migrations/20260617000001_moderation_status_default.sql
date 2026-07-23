-- Set contentReports.status default to 'unverified' now that the enum value is committed.
-- Must be a separate migration because ALTER TYPE ADD VALUE cannot be used in the same
-- transaction as a statement that references the new value.

alter table "public"."contentReports"
  alter column "status" set default 'unverified'::"reportStatus";
