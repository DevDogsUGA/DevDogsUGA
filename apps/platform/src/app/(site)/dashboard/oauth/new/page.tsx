import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import OAuthNewClient from "~/classic/components/Settings/OAuthNewClient";
import PageShell from "~/classic/components/PageShell";
import { CardSkeleton } from "~/classic/components/Skeletons";
import Callout from "~/classic/ui/callout";
import { getOAuthPageData } from "~/server/loaders/console";
import { resolveIssuer } from "~/server/oauth/issuer";

export const metadata: Metadata = {
  title: "New OAuth app | Settings | DevDogs",
  robots: { index: false },
};

/** What a new app starts with; the server's `DEFAULT_REDIRECT_URIS`. */
const DEFAULT_REDIRECT_URIS = ["http://localhost:3000/auth"];

const LINK = "underline underline-offset-4 hover:text-white";

async function NewClient() {
  const [data, issuer] = await Promise.all([
    getOAuthPageData(),
    // Read from discovery rather than written down: see dashboard/oauth/page.
    resolveIssuer().catch(() => null),
  ]);

  if (!data.hasGithub) {
    return (
      <Callout tone="warning" title="Link GitHub to create apps">
        Apps need a linked GitHub account.{" "}
        <Link href="/dashboard/profile#github" className={LINK}>
          Link GitHub account
        </Link>
      </Callout>
    );
  }

  if (data.appCount >= data.maxApps) {
    return (
      <Callout tone="warning" title="You own the most apps a member can">
        You have {data.appCount} of {data.maxApps} apps. Delete one to create
        another.{" "}
        <Link href="/dashboard/oauth" className={LINK}>
          Back to your apps
        </Link>
      </Callout>
    );
  }

  return (
    <OAuthNewClient
      issuer={issuer}
      defaultRedirectUris={DEFAULT_REDIRECT_URIS}
    />
  );
}

export default async function NewOAuthClientPage() {
  return (
    <div className="flex min-w-0 flex-1 flex-col bg-mauve-900">
      <PageShell
        accent="cyan"
        title="New OAuth app"
        description="Two steps: describe the app, then copy its secret. The secret is shown once."
      >
        <Suspense fallback={<CardSkeleton rows={3} />}>
          <NewClient />
        </Suspense>
      </PageShell>
    </div>
  );
}
