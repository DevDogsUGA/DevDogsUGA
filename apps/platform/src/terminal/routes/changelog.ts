import * as newsletter from "@devdogsuga/newsletter";
import {
  ISSUES,
  issueByVersion,
  SITE,
  type ChangelogIssue,
} from "@devdogsuga/newsletter";
import type { Block, Card, Entry, EventItem } from "../blocks";
import { NOT_FOUND, page, PUBLIC, terminal } from "../define";
import { dayLabel, ROOM_TBA, timeSpan } from "../meetings";
import { ACCENT, meetingChip, TONE } from "../theme";
import { locationLine } from "~/components/EventsSection/FindUs/buildings";

/**
 * /changelog and /changelog/:version: the newsletter, from the same `ISSUES`
 * the archive pages and the sent emails render. Section order and wording
 * follow `ChangelogEmail`: the featured cards under the issue's own label,
 * then `upcoming`, `new here?` and `sign-off`.
 */

/**
 * A meeting as an issue carries it. Structural rather than the events
 * package's `Meeting`, because the newsletter resolves its own copy of that
 * package: older releases key meetings by Airtable id with no slug, newer ones
 * by slug. A row links to its event page only when it has a slug.
 */
interface IssueMeeting {
  slug?: string;
  title: string;
  summary: string | null;
  kind: string | null;
  building: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string;
  rsvpUrl: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
}

interface IssueFeature {
  meeting: IssueMeeting;
  cta?: string;
  partner?: string;
}

/**
 * The hero events, in either issue shape: one `featured` meeting with an
 * issue-level `cta` (newsletter ≤ 0.1.16), or an array of features each with
 * a `cta` or a `partner` (Backstage's unreleased "feature one or more events
 * per issue"). Reading both means the platform's next newsletter bump needs
 * nothing here.
 */
function features(issue: ChangelogIssue): IssueFeature[] {
  const raw = issue as unknown as { featured: unknown; cta?: string };
  if (Array.isArray(raw.featured)) return raw.featured as IssueFeature[];
  return [{ meeting: raw.featured as IssueMeeting, cta: raw.cta }];
}

/** Partner names and links, from releases that export them. */
const PARTNERS = (
  newsletter as unknown as {
    PARTNERS?: Record<string, { name: string; url: string }>;
  }
).PARTNERS;

function eventPath(meeting: IssueMeeting): string | undefined {
  return meeting.slug
    ? `/events/${encodeURIComponent(meeting.slug)}`
    : undefined;
}

function issueEventItem(meeting: IssueMeeting): EventItem {
  const startsAt = new Date(meeting.startsAt);
  const cancelled = meeting.cancelledAt !== null;
  return {
    date: dayLabel(startsAt),
    title: meeting.title,
    // A night with no kind is a workshop night, the email's reading.
    chip: meetingChip(meeting.kind, true),
    facts: [
      timeSpan(startsAt, new Date(meeting.endsAt)),
      locationLine(meeting.building, meeting.location) ?? ROOM_TBA,
    ],
    cancelled,
    note: cancelled ? (meeting.cancellationReason ?? undefined) : undefined,
    path: eventPath(meeting),
  };
}

function featureCard(feature: IssueFeature): Card {
  const { meeting } = feature;
  const item = issueEventItem(meeting);
  const partner = feature.partner ? PARTNERS?.[feature.partner] : undefined;
  return {
    color: item.chip.color,
    chips: [item.chip],
    meta: item.date,
    title: meeting.title,
    facts: item.facts,
    body: meeting.summary ?? undefined,
    action: partner
      ? { kind: "partner", label: partner.name, url: partner.url }
      : {
          kind: "cta",
          label: feature.cta ?? "See the schedule",
          url: meeting.rsvpUrl ?? `${SITE}/events`,
        },
  };
}

export const changelogIssue = terminal(PUBLIC, ({ params }) => {
  const issue = issueByVersion(params.version ?? "");
  if (!issue) return NOT_FOUND;
  const featured = features(issue);
  const lead = featured[0]
    ? issueEventItem(featured[0].meeting).chip.color
    : TONE.ink;
  const body: Block[] = [
    { type: "lead", text: issue.tagline },
    { type: "text", text: issue.intro },
    { type: "heading", text: issue.featuredLabel, color: lead },
    ...featured.map((feature): Block => ({
      type: "card",
      card: featureCard(feature),
    })),
    { type: "heading", text: "upcoming", color: TONE.ink },
    {
      type: "events",
      items: issue.upcoming.map((meeting) =>
        issueEventItem(meeting as IssueMeeting),
      ),
      empty: "Nothing else on the calendar yet.",
    },
    { type: "heading", text: "new here?", color: ACCENT.amber },
    {
      type: "text",
      text: "No experience required, ever. Bring a laptop if you've got one, curiosity if you don't. Start here:",
    },
    {
      type: "links",
      items: [
        { label: "join the Discord", url: "https://discord.gg/devdogs" },
        { label: "add our events", url: `${SITE}/events` },
        { label: "see what we build", url: "https://github.com/devdogsuga" },
      ],
    },
    { type: "heading", text: "sign-off", color: ACCENT.rose },
    { type: "text", text: issue.signoff },
  ];
  return page({
    banner: "CHANGELOG",
    accent: "emerald",
    aside: [`v${issue.version} · ${issue.term}`],
    status: issue.sendLabel,
    command: issue.command,
    body,
  });
});

export const changelogArchive = terminal(PUBLIC, () => {
  const issues = [...ISSUES].reverse();
  const latest = issues[0];
  const body: Block[] = [
    {
      type: "text",
      text: "The weekly DevDogs newsletter, versioned like the software it covers. Each issue logs what the club is building and where to show up next.",
    },
  ];
  // Grouped by term, newest first, the way the archive page lists them.
  let term: string | null = null;
  let group: Entry[] = [];
  const flush = () => {
    if (term === null) return;
    body.push(
      { type: "heading", text: term.toLowerCase().replace(/\s+/g, "_") },
      { type: "entries", items: group, empty: "" },
    );
  };
  for (const issue of issues) {
    if (issue.term !== term) {
      flush();
      term = issue.term;
      group = [];
    }
    group.push({
      label: `v${issue.version}`,
      meta: issue.sendLabel,
      current: issue === latest,
      chip:
        issue === latest ? { label: "latest", color: TONE.brand } : undefined,
      headline: issue.tagline,
      text: issue.preview,
      path: `/changelog/${issue.version}`,
    });
  }
  flush();
  return page({
    banner: "CHANGELOG",
    accent: "emerald",
    aside: latest ? [`latest v${latest.version}`] : [],
    status: `${issues.length} issues`,
    command: "changelog --list",
    body,
  });
});
