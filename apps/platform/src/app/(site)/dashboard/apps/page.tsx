import { rules, requireAccess } from "~/server/auth/access";
import type { Metadata } from "next";
import { Suspense } from "react";
import ConsoleAppsField from "~/classic/components/Console/ConsoleAppsField";
import PageShell from "~/classic/components/PageShell";
import { CardSkeleton } from "~/classic/components/Skeletons";
import { ConsoleCard } from "~/classic/ui/card";
import Field from "~/classic/ui/field";
import { getConsoleApps } from "~/server/loaders/oauthApps";

export const metadata: Metadata = {
  title: "Apps | Console | DevDogs",
  robots: { index: false },
};

async function AppsData() {
  const apps = await getConsoleApps();
  return (
    <ConsoleCard.Root id="oauth-apps">
      <ConsoleCard.Header title="OAuth apps" />
      <ConsoleCard.Content>
        <Field
          id="oauth-apps-list"
          label="Apps"
          description="DevDogs apps, then members' apps In production, then their apps still in Testing. A member keeps managing their own app; publishing, returning to Testing and transferring are yours, and you edit a DevDogs app here. Every change is recorded in the audit log."
        >
          <ConsoleAppsField apps={apps} />
        </Field>
      </ConsoleCard.Content>
    </ConsoleCard.Root>
  );
}

export default async function ConsoleAppsPage() {
  await requireAccess(rules.manageOAuthApps);

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-mauve-900">
      <PageShell
        accent="cyan"
        title="Apps"
        description="Publish OAuth apps, return them to Testing, transfer them to DevDogs and choose which skip the consent screen."
      >
        <Suspense fallback={<CardSkeleton rows={2} />}>
          <AppsData />
        </Suspense>
      </PageShell>
    </div>
  );
}
