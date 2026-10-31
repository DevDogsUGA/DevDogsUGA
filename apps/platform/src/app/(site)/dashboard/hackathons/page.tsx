import type { Metadata } from "next";
import { connection } from "next/server";
import { HackathonDecision } from "~/components/Hackathons/HackathonDecision";
import { SubmitHackathonForm } from "~/components/Hackathons/SubmitHackathonForm";
import { requireDashboard, rules } from "~/server/auth/access";
import { getHackathonsPage } from "~/server/hackathons/load";
import {
  whenText,
  type HackathonStatus,
  type ListedHackathon,
} from "~/server/hackathons/present";
import { PageHeading, Panel } from "~/ui/app-shell";
import Badge from "~/ui/badge";
import { EmptyState } from "~/ui/empty-state";
import { ListRow } from "~/ui/list-row";
import { TextLink } from "~/ui/text-link";

export const metadata: Metadata = {
  title: "Hackathons | DevDogs",
  robots: { index: false },
};

const STATUS: Record<
  Exclude<HackathonStatus, null>,
  { label: string; variant: "success" | "info" | "default" }
> = {
  open: { label: "Open", variant: "success" },
  upcoming: { label: "Upcoming", variant: "info" },
  earlier: { label: "Earlier", variant: "default" },
};

/** One hackathon as a row: its own page in a new tab, its dates and place, its state. */
function Row({
  hackathon,
  end,
  extra,
}: {
  hackathon: ListedHackathon;
  end?: React.ReactNode;
  extra?: string;
}) {
  const detail = [extra, whenText(hackathon), hackathon.location]
    .filter(Boolean)
    .join(" · ");
  return (
    <ListRow
      variant="account"
      title={
        <TextLink
          href={hackathon.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          {hackathon.name}
        </TextLink>
      }
      description={detail || undefined}
      end={end}
    >
      <span id={`hackathon-${hackathon.id}`} />
    </ListRow>
  );
}

/**
 * Hackathons members can enter: Devpost's online ones, synced daily, and the
 * ones members have submitted and an officer approved. Any member submits one;
 * officers decide on the submissions waiting. Each project's own Submissions
 * are recorded on the project's page.
 */
export default async function HackathonsPage() {
  await connection();
  const caller = await requireDashboard();
  const officer = rules.officer(caller);
  const { current, earlier, mine, waiting, syncedAt } = await getHackathonsPage(
    caller.userId,
    officer,
  );
  const listed = [...current, ...earlier];
  return (
    <>
      <PageHeading
        title="Hackathons"
        description="Online hackathons you can enter with a project, from Devpost and from members."
      />
      <Panel
        id="hackathons"
        title="Listed hackathons"
        help={
          syncedAt
            ? `Devpost's list was last refreshed ${syncedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" })}.`
            : "Devpost's list appears after its first refresh."
        }
      >
        {listed.length === 0 ? (
          <EmptyState title="No hackathons listed yet" />
        ) : (
          listed.map((hackathon) => (
            <Row
              key={hackathon.id}
              hackathon={hackathon}
              end={
                hackathon.status ? (
                  <Badge variant={STATUS[hackathon.status].variant}>
                    {STATUS[hackathon.status].label}
                  </Badge>
                ) : undefined
              }
            />
          ))
        )}
      </Panel>
      <Panel
        id="submit"
        title="Submit a hackathon"
        help="For a hackathon that isn't on Devpost. An officer reviews it before it's listed."
      >
        <SubmitHackathonForm />
      </Panel>
      {mine.length > 0 && (
        <Panel id="yours" title="Your submissions">
          {mine.map((hackathon) => (
            <Row
              key={hackathon.id}
              hackathon={hackathon}
              end={
                hackathon.approval === "declined" ? (
                  <Badge>Declined</Badge>
                ) : (
                  <Badge variant="warning">Awaiting review</Badge>
                )
              }
            />
          ))}
        </Panel>
      )}
      {officer && (
        <Panel
          id="review"
          title="Waiting for review"
          help="Approving lists the hackathon for every member. Each decision is written to the audit log."
        >
          {waiting.length === 0 ? (
            <EmptyState title="Nothing waiting for review" />
          ) : (
            waiting.map((hackathon) => (
              <Row
                key={hackathon.id}
                hackathon={hackathon}
                extra={
                  hackathon.submittedByName
                    ? `Submitted by ${hackathon.submittedByName}`
                    : undefined
                }
                end={<HackathonDecision id={hackathon.id} />}
              />
            ))
          )}
        </Panel>
      )}
    </>
  );
}
