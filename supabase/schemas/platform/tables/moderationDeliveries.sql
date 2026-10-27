CREATE TABLE "platform"."moderationDeliveries" (
  "id"            uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "appId"         uuid,
  "clientId"      uuid,
  "reportId"      uuid,
  "type"          text                     NOT NULL,
  "payload"       jsonb                    NOT NULL,
  "attempts"      integer                  NOT NULL DEFAULT 0,
  "lastError"     text,
  "lastAttemptAt" timestamp with time zone,
  "queuedAt"      timestamp with time zone,
  "deliveredAt"   timestamp with time zone,
  "createdAt"     timestamp with time zone NOT NULL DEFAULT now(),
  "sandbox"       boolean                  NOT NULL DEFAULT false,
  CONSTRAINT "moderationDeliveries_appId_fkey" FOREIGN KEY ("appId") REFERENCES platform.apps(id) ON DELETE CASCADE,
  CONSTRAINT "moderationDeliveries_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES auth.oauth_clients(id) ON DELETE SET NULL,
  CONSTRAINT "moderationDeliveries_pkey" PRIMARY KEY (id),
  CONSTRAINT "moderationDeliveries_target_check" CHECK ((("appId" IS NOT NULL) OR sandbox)),
  CONSTRAINT "moderationDeliveries_type_check"
    CHECK ((type = ANY (ARRAY['content.hide'::text, 'content.remove'::text, 'content.restore'::text, 'user.suspend'::text, 'user.ban'::text, 'user.restore'::text, 'user.delete'::text]))),
  CONSTRAINT "moderationDeliveries_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES platform.reports(id) ON DELETE SET NULL
);

ALTER TABLE "platform"."moderationDeliveries"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "platform"."moderationDeliveries"
  ADD COLUMN "status" platform."deliveryStatus" NOT NULL DEFAULT 'pending'::platform."deliveryStatus";

CREATE INDEX "moderationDeliveries_client_idx" ON platform."moderationDeliveries" USING btree ("clientId", "createdAt" DESC);

CREATE INDEX "moderationDeliveries_pending_idx" ON platform."moderationDeliveries" USING btree ("queuedAt")
  WHERE (status = 'pending'::platform."deliveryStatus");

CREATE INDEX "moderationDeliveries_report_idx" ON platform."moderationDeliveries" USING btree ("reportId");

REVOKE ALL ON TABLE "platform"."moderationDeliveries" FROM "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."moderationDeliveries" TO "postgres", "service_role";
