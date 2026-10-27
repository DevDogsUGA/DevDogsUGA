CREATE TABLE "platform"."configEdits" (
  "id"        uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "userId"    uuid                     NOT NULL,
  "collection" text                   NOT NULL,
  "itemKey"   text                     NOT NULL,
  "isNew"     boolean                  NOT NULL DEFAULT false,
  "fields"    jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  "updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "configEdits_collection_choices" CHECK ((collection = ANY (ARRAY['meeting'::text, 'workshop'::text, 'venue'::text]))),
  CONSTRAINT "configEdits_fields_bounded" CHECK ((pg_column_size(fields) <= 16384)),
  CONSTRAINT "configEdits_fields_object" CHECK ((jsonb_typeof(fields) = 'object'::text)),
  CONSTRAINT "configEdits_itemKey_length" CHECK (((char_length("itemKey") >= 1) AND (char_length("itemKey") <= 120))),
  CONSTRAINT "configEdits_pkey" PRIMARY KEY (id),
  CONSTRAINT "configEdits_user_item_key" UNIQUE ("userId", collection, "itemKey"),
  CONSTRAINT "configEdits_userId_fkey" FOREIGN KEY ("userId") REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE
);

ALTER TABLE "platform"."configEdits"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crud_public_policy_delete" ON "platform"."configEdits"
  AS RESTRICTIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_insert" ON "platform"."configEdits"
  AS RESTRICTIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (false);

CREATE POLICY "crud_public_policy_select" ON "platform"."configEdits"
  AS RESTRICTIVE
  FOR SELECT
  TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_update" ON "platform"."configEdits"
  AS RESTRICTIVE
  FOR UPDATE
  TO PUBLIC
  USING (false)
  WITH CHECK (false);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."configEdits" TO "postgres", "service_role";

REVOKE ALL ON TABLE "platform"."configEdits" FROM "anon", "authenticated";

COMMENT ON TABLE "platform"."configEdits" IS 'Server-only. An officer''s saved, personal edits to the events config (a meeting, a workshop or a venue), one row per item. "fields" holds only the fields that differ from the official config, so every other field follows the latest merged config; a new item (isNew) stores all of its fields, and a null for an optional field means "remove the key". Nothing here is published: Open PR turns the rows into a pull request through the config-PR GitHub App, and the merged config stays authoritative. Account deletion: the officer''s saved edits are deleted with the account (ON DELETE CASCADE, Q168); pull requests already opened stay on GitHub and in the audit log.';

COMMENT ON COLUMN "platform"."configEdits"."collection" IS 'Which config file the item lives in: meeting (meetings.json), workshop (workshops.json) or venue (venues.json).';

COMMENT ON COLUMN "platform"."configEdits"."itemKey" IS 'The item''s identity in its file: a meeting''s slug, a workshop''s or venue''s id.';

COMMENT ON COLUMN "platform"."configEdits"."fields" IS 'Only the changed fields (all of them for a new item). A null value on an optional field removes the key, so the meeting inherits from its series again.';
