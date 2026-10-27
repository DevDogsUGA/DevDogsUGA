import type { auditEvents } from "~/server/db/schema";

/**
 * Audit entries for OAuth apps (`/console/audit-log`).
 *
 * An app that is In production (or a DevDogs app) is a credential real members
 * sign in with, so rolling its secret, changing where it may send people and
 * deleting it are recorded: who, which client, and in what state. Every status
 * change is recorded whatever the app's state (oauth-consent Q155): publishing,
 * returning to Testing, the consent switch, transferring to DevDogs, and
 * forgetting an approval, each with the kill switch's counts where it ran one.
 * Apps in Testing are a member's own test tool and their ordinary edits are not
 * audited (a workshop mints dozens in an hour).
 *
 * The rows are plain `platform."auditEvents"` inserts, append-only like every
 * other entry; `targetType` is `oauth_client` and `targetId` is the client id.
 * Never put a secret in `metadata`.
 */
export const OAUTH_AUDIT_ACTIONS = [
  "oauth_client.created",
  "oauth_client.deleted",
  "oauth_client.secret_rotated",
  "oauth_client.redirect_uri_added",
  "oauth_client.redirect_uri_removed",
  // Registering a client as a moderation app, rotating its signing secret and
  // changing its endpoint. The secret is derived per client, not stored, but
  // rotating it cuts off the app's reports until it is updated, so it is
  // recorded like the OAuth secret; the endpoint decides where a decision about
  // a member is sent.
  "oauth_client.moderation_registered",
  "oauth_client.moderation_secret_rotated",
  "oauth_client.moderation_endpoint_changed",
  // Status and consent changes (holder-only, Q155 / Q161 / Q162), and the
  // kill switch run for one member (Q158).
  "oauth_app.published",
  "oauth_app.returned_to_testing",
  "oauth_app.consent_changed",
  "oauth_app.transferred_to_devdogs",
  "oauth_app.approval_forgotten",
] as const;

export type OAuthAuditAction = (typeof OAUTH_AUDIT_ACTIONS)[number];

export const OAUTH_AUDIT_TARGET_TYPE = "oauth_client";

export function oauthAuditEvent(input: {
  actorUserId: string;
  action: OAuthAuditAction;
  clientId: string;
  metadata: Record<string, string | number | boolean | null>;
}): typeof auditEvents.$inferInsert {
  return {
    actorType: "user",
    actorUserId: input.actorUserId,
    source: "platform",
    action: input.action,
    targetType: OAUTH_AUDIT_TARGET_TYPE,
    targetId: input.clientId,
    metadata: input.metadata,
  };
}
