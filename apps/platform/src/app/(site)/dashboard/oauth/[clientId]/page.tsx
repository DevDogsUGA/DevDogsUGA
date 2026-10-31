import type { Metadata } from "next";
import { notFound } from "next/navigation";
import OAuthClientDetails from "~/components/Settings/OAuthClientDetails";
import { statusLabel } from "~/components/Settings/OAuthClientTable";
import "~/components/Settings/settings.css";
import { requireDashboard } from "~/server/auth/access";
import { getOAuthClientPage } from "~/server/loaders/oauthClient";
import { PageHeading } from "~/ui/app-shell";
import Badge from "~/ui/badge";

export const metadata: Metadata = {
  title: "OAuth app | DevDogs",
  robots: { index: false },
};

/**
 * One OAuth client, for its owner or, for a DevDogs app, a holder of
 * `canManageOAuthApps`. The loader applies that Record rule and answers null
 * for anyone else, so a client that is not yours reads as one that does not
 * exist.
 */
export default async function OAuthClientPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  await requireDashboard();
  const page = await getOAuthClientPage(clientId);
  if (!page) notFound();

  const { client, devDogsApp, testAccounts, moderation } = page;
  return (
    <div className="settings-shell">
      <PageHeading
        crumbs={[
          devDogsApp
            ? { label: "Apps", href: "/dashboard/apps" }
            : { label: "OAuth apps", href: "/dashboard/oauth" },
          { label: client.label },
        ]}
        title={client.label}
        description="Credentials, redirect URIs and the details members see when they sign in."
        actions={
          <Badge
            variant={client.status === "in_production" ? "warning" : "info"}
          >
            {statusLabel(client.status)}
          </Badge>
        }
      />
      <OAuthClientDetails
        client={client}
        testAccounts={testAccounts}
        moderation={moderation}
        devDogsApp={devDogsApp}
      />
    </div>
  );
}
