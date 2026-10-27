import { desc, inArray } from "drizzle-orm";
import { cache } from "react";
import { db } from "~/server/db";
import {
  moderationClients,
  moderationDeliveries,
  sandboxReports,
} from "~/server/db/schema";
import { canUserManageOAuthApps } from "~/server/actions/permissions";
import { expectSession } from "~/server/auth";
import { getOAuthPageData } from "~/server/loaders/console";
import { getConsoleApps } from "~/server/loaders/oauthApps";

export type SandboxReportRow = {
  id: string;
  contentType: string;
  contentRef: string;
  reason: string;
  createdAt: string;
};

export type TestDeliveryRow = {
  id: string;
  type: string;
  status: "pending" | "delivered" | "failed";
  attempts: number;
  lastError: string | null;
  createdAt: string;
};

export type ClientModeration = {
  clientId: string;
  label: string;
  enabled: boolean;
  endpointUrl: string | null;
  /**
   * A production-tier client, or one an officer registered as a production
   * app. Its reports reach the moderators; it never takes sandbox test
   * actions.
   */
  production: boolean;
  /** Whether an officer has registered it as a moderation app (the console's Apps Outside the Platform). */
  registered: boolean;
  sandboxReports: SandboxReportRow[];
  testDeliveries: TestDeliveryRow[];
};

const PER_CLIENT = 10;

/**
 * Moderation state for each OAuth client the signed-in member manages: their
 * own development clients, plus every production client when they hold
 * `canManageOAuthApps` (the same rule `/tools/oauth` lists them by). Whether
 * it is on, where decisions go, the sandbox reports its backend has filed and
 * the test actions sent to it. The ids come from `getOAuthPageData`, so this
 * never reads a client the member cannot manage.
 */
export const getOAuthModerationData = cache(
  async (): Promise<ClientModeration[]> => {
    const { clients: own } = await getOAuthPageData();
    const userId = await expectSession();
    // A holder also sees the DevDogs apps and other members' published apps,
    // the ones real members sign in with (the same rule Console → Apps lists).
    // getConsoleApps also returns members' Testing apps; those stay private.
    const published = (
      (await canUserManageOAuthApps(userId)) ? await getConsoleApps() : []
    ).filter((app) => app.isDevDogs || app.status === "in_production");
    const productionIds = new Set([
      ...own.filter((c) => c.status === "in_production").map((c) => c.clientId),
      ...published.map((client) => client.clientId),
    ]);
    const clients = [
      ...own,
      ...published.filter((p) => !own.some((o) => o.clientId === p.clientId)),
    ];
    if (clients.length === 0) return [];
    const ids = clients.map((client) => client.clientId);

    const [settings, reports, deliveries] = await Promise.all([
      db
        .select()
        .from(moderationClients)
        .where(inArray(moderationClients.clientId, ids)),
      db
        .select()
        .from(sandboxReports)
        .where(inArray(sandboxReports.clientId, ids))
        .orderBy(desc(sandboxReports.createdAt))
        .limit(PER_CLIENT * ids.length),
      db
        .select()
        .from(moderationDeliveries)
        .where(inArray(moderationDeliveries.clientId, ids))
        .orderBy(desc(moderationDeliveries.createdAt))
        .limit(PER_CLIENT * ids.length),
    ]);

    return clients.map((client) => {
      const setting = settings.find((s) => s.clientId === client.clientId);
      return {
        clientId: client.clientId,
        label: client.label,
        enabled: setting !== undefined,
        endpointUrl: setting?.endpointUrl ?? null,
        production:
          productionIds.has(client.clientId) || setting?.appId != null,
        registered: setting?.appId != null,
        sandboxReports: reports
          .filter((r) => r.clientId === client.clientId)
          .slice(0, PER_CLIENT)
          .map((r) => ({
            id: r.id,
            contentType: r.contentType,
            contentRef: r.contentRef,
            reason: r.reason,
            createdAt: r.createdAt.toISOString(),
          })),
        testDeliveries: deliveries
          .filter((d) => d.clientId === client.clientId && d.sandbox)
          .slice(0, PER_CLIENT)
          .map((d) => ({
            id: d.id,
            type: d.type,
            status: d.status,
            attempts: d.attempts,
            lastError: d.lastError,
            createdAt: d.createdAt.toISOString(),
          })),
      };
    });
  },
);
