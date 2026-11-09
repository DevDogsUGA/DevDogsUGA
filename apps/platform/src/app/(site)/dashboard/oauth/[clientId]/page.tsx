import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PageShell from "~/classic/components/PageShell";
import OAuthClientDetails from "~/classic/components/Settings/OAuthClientDetails";
import { statusLabel } from "~/classic/components/Settings/OAuthClientTable";
import Badge from "~/classic/ui/badge";
import { requireDashboard } from "~/server/auth/access";
import { getOAuthClientPage } from "~/server/loaders/oauthClient";

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
    <div className="flex min-w-0 flex-1 flex-col bg-mauve-900">
      <PageShell
        accent="cyan"
        title={client.label}
        description="Credentials, redirect URIs and the details members see when they sign in."
        actions={
          <Badge
            variant={client.status === "in_production" ? "warning" : "info"}
          >
            {statusLabel(client.status)}
          </Badge>
        }
      >
        {/* The baseline page had no breadcrumbs, so the way back is a plain
            link. A DevDogs app's list is the hidden Apps screen: no link. */}
        {!devDogsApp && (
          <Link
            href="/dashboard/oauth"
            className="w-fit text-sm text-mauve-300 underline underline-offset-4 hover:text-white"
          >
            Back to OAuth apps
          </Link>
        )}
        <OAuthClientDetails
          client={client}
          testAccounts={testAccounts}
          moderation={moderation}
          devDogsApp={devDogsApp}
        />
      </PageShell>
    </div>
  );
}
