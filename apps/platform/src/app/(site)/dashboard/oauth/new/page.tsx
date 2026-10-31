import type { Metadata } from "next";
import { Suspense } from "react";
import OAuthNewClient from "~/components/Settings/OAuthNewClient";
import "~/components/Settings/settings.css";
import { getOAuthPageData } from "~/server/loaders/console";
import { resolveIssuer } from "~/server/oauth/issuer";
import { PageHeading } from "~/ui/app-shell";
import Callout from "~/ui/callout";
import { Skeleton } from "~/ui/skeleton";
import Link from "next/link";

export const metadata: Metadata = {
  title: "New OAuth app | Settings | DevDogs",
  robots: { index: false },
};

/** What a new app starts with; the server's `DEFAULT_REDIRECT_URIS`. */
const DEFAULT_REDIRECT_URIS = ["http://localhost:3000/auth"];

async function NewClient() {
  const [data, issuer] = await Promise.all([
    getOAuthPageData(),
    // Read from discovery rather than written down: see settings/oauth/page.
    resolveIssuer().catch(() => null),
  ]);

  if (!data.hasGithub) {
    return (
      <Callout tone="warning" title="Link GitHub to create apps">
        Apps need a linked GitHub account.{" "}
        <Link href="/dashboard/accounts#github" className="textlink">
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
        <Link href="/dashboard/oauth" className="textlink">
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
    <div className="settings-shell">
      <PageHeading
        crumbs={[
          { label: "OAuth apps", href: "/dashboard/oauth" },
          { label: "New app" },
        ]}
        title="New OAuth app"
        description="Two steps: describe the app, then copy its secret. The secret is shown once."
      />
      <Suspense fallback={<Skeleton className="h-64 w-full max-w-[720px]" />}>
        <NewClient />
      </Suspense>
    </div>
  );
}
