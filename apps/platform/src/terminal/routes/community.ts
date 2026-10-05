import { INVOLVEMENT_NETWORK_ROSTER_URL } from "~/config/nav";
import { formatEventDate } from "~/lib/eventTime";
import { handleFromSegment, profilePath } from "~/lib/profilePath";
import { publicProfilesEnabled } from "~/server/features";
import { getCompetitionArchive } from "~/server/loaders/competitionArchive";
import { getCurrentOfficers } from "~/server/loaders/officers";
import {
  getPublicHandlesByUserId,
  getPublicProfileActivity,
  getPublicProfileByHandle,
  listPublicProfiles,
} from "~/server/loaders/publicProfiles";
import type { Block, Entry, Field } from "../blocks";
import { gatedBy, NOT_FOUND, page, terminal } from "../define";
import { ACCENT } from "../theme";

/**
 * The community paths, behind the same `publicProfilesEnabled` switch as
 * their pages and switched off the same way: `/community` redirects to the
 * Involvement Network roster, the archive and profiles 404.
 */

export const communityDirectory = terminal(
  gatedBy(publicProfilesEnabled, {
    kind: "redirect",
    url: INVOLVEMENT_NETWORK_ROSTER_URL,
  }),
  async () => {
    const [officers, members] = await Promise.all([
      getCurrentOfficers(),
      listPublicProfiles(),
    ]);
    const officerHandles = await getPublicHandlesByUserId(
      officers.map((officer) => officer.slug),
    );
    // Officers lead; a member who is also an officer isn't listed twice.
    const officerHandleSet = new Set(officerHandles.values());
    const others = members.filter(
      (member) => !officerHandleSet.has(member.handle),
    );

    const leadership: Entry[] = officers.map((officer) => {
      const handle = officerHandles.get(officer.slug);
      return {
        label: officer.name,
        meta:
          [officer.pronouns, officer.year].filter(Boolean).join(" · ") ||
          undefined,
        headline: officer.titles.join(", "),
        path: handle ? profilePath(handle) : undefined,
      };
    });
    const directory: Entry[] = others.map((member) => ({
      label: member.displayName ?? `@${member.handle}`,
      meta: member.displayName ? `@${member.handle}` : undefined,
      text: member.bio ?? undefined,
      path: profilePath(member.handle),
    }));

    return page({
      banner: "COMMUNITY",
      accent: "emerald",
      aside: [`${officers.length + others.length} people`],
      command: "community --list",
      body: [
        { type: "text", text: "Meet the members and leadership of DevDogs." },
        { type: "heading", text: "leadership" },
        {
          type: "entries",
          items: leadership,
          empty: "No officers listed yet.",
        },
        { type: "heading", text: "members" },
        { type: "entries", items: directory, empty: "No public profiles yet." },
        {
          type: "commands",
          items: [
            {
              path: "/community/competitions",
              description:
                "Every competition, who won it, and who built the entries.",
            },
          ],
        },
      ],
    });
  },
);

export const competitionArchive = terminal(
  gatedBy(publicProfilesEnabled, { kind: "notFound" }),
  async () => {
    const competitions = await getCompetitionArchive();
    const items: Entry[] = competitions.map((competition) => {
      const contributors = competition.contributors.map((c) => `@${c.handle}`);
      if (competition.privateContributorCount > 0) {
        contributors.push(`+${competition.privateContributorCount} more`);
      }
      return {
        label: competition.title,
        meta: competition.closedAt
          ? `${formatEventDate(competition.kickedOffAt)} – ${formatEventDate(competition.closedAt)}`
          : `since ${formatEventDate(competition.kickedOffAt)}`,
        current: competition.closedAt === null,
        chip:
          competition.closedAt === null
            ? { label: "open", color: ACCENT.amber }
            : undefined,
        headline: competition.winner
          ? `Won by ${competition.winner.teamName}`
          : undefined,
        text: [
          competition.briefExcerpt,
          contributors.length ? `Built by ${contributors.join(", ")}` : null,
        ]
          .filter(Boolean)
          .join(" "),
        path: `/competitions/${encodeURIComponent(competition.slug)}`,
      };
    });
    return page({
      banner: "COMPETITIONS",
      accent: "emerald",
      aside: ["the archive"],
      status: `${competitions.length} competitions`,
      command: "competition --archive",
      body: [
        {
          type: "text",
          text: "Every DevDogs competition, who won it, and the members who built the entries.",
        },
        { type: "entries", items, empty: "No competitions yet." },
      ],
    });
  },
);

export const communityProfile = terminal(
  gatedBy(publicProfilesEnabled, { kind: "notFound" }),
  async ({ params }) => {
    const handle = handleFromSegment(params.handle ?? "");
    if (!handle) return NOT_FOUND;
    const [profile, activity] = await Promise.all([
      getPublicProfileByHandle(handle),
      getPublicProfileActivity(handle),
    ]);
    if (!profile || !activity) return NOT_FOUND;

    const body: Block[] = [
      { type: "lead", text: profile.displayName ?? `@${profile.handle}` },
    ];
    if (profile.bio) body.push({ type: "text", text: profile.bio });
    if (profile.roleDescription) {
      body.push({ type: "text", text: profile.roleDescription, tone: "dim" });
    }

    const accounts: Field[] = [];
    if (profile.githubHandle) {
      accounts.push({
        label: "github",
        value: `https://github.com/${profile.githubHandle}`,
        link: true,
      });
    }
    if (profile.discordHandle)
      accounts.push({ label: "discord", value: profile.discordHandle });
    if (profile.linkedinName)
      accounts.push({ label: "linkedin", value: profile.linkedinName });
    if (accounts.length) body.push({ type: "fields", rows: accounts });

    if (activity.stars) {
      body.push(
        { type: "heading", text: "stars" },
        {
          type: "fields",
          rows: [
            { label: "meetings", value: String(activity.stars.meetingStars) },
            {
              label: "competitions",
              value: String(activity.stars.competitionStars),
            },
            { label: "wins", value: String(activity.stars.wins) },
          ],
        },
      );
    }
    if (activity.competitions?.length) {
      body.push(
        { type: "heading", text: "competitions" },
        {
          type: "entries",
          items: activity.competitions.map((entry) => ({
            label: entry.competitionTitle,
            meta: entry.teamName,
            current: entry.won,
            chip: entry.won
              ? { label: "Winner", color: ACCENT.emerald }
              : undefined,
            path: `/competitions/${encodeURIComponent(entry.competitionSlug)}`,
          })),
          empty: "",
        },
      );
    }
    if (activity.contributions?.length) {
      body.push(
        { type: "heading", text: "contributions" },
        {
          type: "links",
          items: activity.contributions.map((pr) => ({
            label: `#${pr.prNumber} ${pr.competitionTitle}`,
            url: pr.url,
          })),
        },
      );
    }
    if (activity.links?.length) {
      body.push(
        { type: "heading", text: "links" },
        {
          type: "links",
          items: activity.links.map((link) => ({
            label: link.title,
            url: link.url,
          })),
        },
      );
    }

    return page({
      banner: "COMMUNITY",
      accent: "emerald",
      aside: [`@${profile.handle}`],
      command: `whois @${profile.handle}`,
      body,
    });
  },
);
