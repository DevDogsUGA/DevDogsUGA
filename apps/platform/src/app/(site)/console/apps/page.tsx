import { rules, requireAccess } from "~/server/auth/access";
import type { Metadata } from "next";
import { Suspense } from "react";
import ConsoleAppsField from "~/components/Console/ConsoleAppsField";
import "~/components/Console/console.css";
import AppSideNav from "~/components/AppSideNav";
import { AppShell } from "~/ui/app-shell";
import { TableSkeleton } from "~/components/Skeletons";

import { getConsoleApps } from "~/server/loaders/oauthApps";
import { PageHeading, Panel } from "~/ui/app-shell";

export const metadata: Metadata = {
  title: "Apps | Console | DevDogs",
  robots: { index: false },
};

async function AppsData() {
  const apps = await getConsoleApps();
  return (
    <Panel
      id="oauth-apps"
      title="OAuth apps"
      help="DevDogs apps, then members' apps In production, then their apps still in Testing. A member keeps managing their own app; publishing, returning to Testing and transferring are yours, and you edit a DevDogs app here. Every change is recorded in the audit log."
    >
      <ConsoleAppsField apps={apps} />
    </Panel>
  );
}

export default async function ConsoleAppsPage() {
  await requireAccess(rules.manageOAuthApps);

  return (
    <AppShell side={<AppSideNav />} className="con">
      <PageHeading
        title="Apps"
        description="Publish OAuth apps, return them to Testing, transfer them to DevDogs and choose which skip the consent screen."
      />
      <Suspense fallback={<TableSkeleton />}>
        <AppsData />
      </Suspense>
    </AppShell>
  );
}
