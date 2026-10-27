import type { Metadata } from "next";
import Link from "next/link";
import ConsoleShell from "~/components/Console/ConsoleShell";
import { requirePermission } from "~/server/auth/require";
import { isOfficer } from "~/server/actions/permissions";
import { searchMembersForBadges } from "~/server/loaders/badges";
import { PageHeading, Panel } from "~/ui/app-shell";
import { Button } from "~/ui/button";
import { EmptyState } from "~/ui/empty-state";
import Field from "~/ui/field";
import { Input } from "~/ui/input";

export const metadata: Metadata = {
  title: "Badges | Console | DevDogs",
  robots: { index: false },
};

/**
 * Find a member, then award or withdraw their badges. Any officer (a holder of
 * a leadership role) may; the member page repeats the check.
 */
export default async function BadgesConsolePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requirePermission(isOfficer);
  const q = ((await searchParams).q ?? "").trim().slice(0, 80);
  const results = q ? await searchMembersForBadges(q) : [];

  return (
    <ConsoleShell current="/console/badges">
      <PageHeading
        title="Badges"
        description="Award Workshop Host, Guide Author, Mentor and Event Organizer badges with a public citation, and withdraw any badge with a reason. Workshop completed and First Merge are awarded automatically."
      />
      <Panel id="find-member" title="Find a member">
        <form method="get" className="bdg-inline">
          <Field label="Name or handle" htmlFor="badge-search">
            <Input id="badge-search" name="q" defaultValue={q} maxLength={80} />
          </Field>
          <Button type="submit" size="sm">
            Search
          </Button>
        </form>
        {q &&
          (results.length === 0 ? (
            <EmptyState title="No one matches that search" />
          ) : (
            <ul className="con-list">
              {results.map((member) => (
                <li key={member.userId}>
                  <Link href={`/console/badges/${member.userId}`}>
                    {member.name}
                  </Link>
                  {member.handle && (
                    <span className="con-code"> @{member.handle}</span>
                  )}
                </li>
              ))}
            </ul>
          ))}
      </Panel>
    </ConsoleShell>
  );
}
