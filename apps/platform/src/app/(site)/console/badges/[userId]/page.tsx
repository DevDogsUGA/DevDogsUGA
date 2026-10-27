import { getBadges } from "@devdogsuga/events";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import {
  BadgeAwardForm,
  BadgeWithdrawForm,
} from "~/components/Badges/BadgeAwardForm";
import BadgeList from "~/components/Badges/BadgeList";
import ConsoleShell from "~/components/Console/ConsoleShell";
import { isOfficer } from "~/server/actions/permissions";
import { requirePermission } from "~/server/auth/require";
import { getBadgesForOfficer, getMemberName } from "~/server/loaders/badges";
import { PageHeading, Panel } from "~/ui/app-shell";

export const metadata: Metadata = {
  title: "Member badges | Console | DevDogs",
  robots: { index: false },
};

export default async function MemberBadgesPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  await requirePermission(isOfficer);
  const { userId } = await params;
  if (!z.string().uuid().safeParse(userId).success) notFound();
  const name = await getMemberName(userId);
  if (!name) notFound();

  const entries = await getBadgesForOfficer(userId);
  const awardable = getBadges()
    .badges.filter((badge) => badge.kind === "manual" && !badge.perWorkshop)
    .map((badge) => ({ id: badge.id, name: badge.name }));

  return (
    <ConsoleShell current="/console/badges">
      <PageHeading
        crumbs={[{ label: "Badges", href: "/console/badges" }, { label: name }]}
        title={name}
        description="Every award, including hidden and withdrawn ones. Awards and withdrawals are written to the audit log."
      />
      <Panel id="award" title="Award a badge">
        <BadgeAwardForm userId={userId} badges={awardable} />
      </Panel>
      <Panel id="badges" title="Badges">
        <BadgeList
          entries={entries}
          empty="This member has no badges yet."
          actions={(award) => <BadgeWithdrawForm awardId={award.id} />}
        />
      </Panel>
    </ConsoleShell>
  );
}
