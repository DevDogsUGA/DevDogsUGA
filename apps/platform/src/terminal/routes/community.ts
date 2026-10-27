import { INVOLVEMENT_NETWORK_ROSTER_URL } from "~/config/nav";
import { formatEventDate } from "~/lib/eventTime";
import { handleFromSegment, profilePath } from "~/lib/profilePath";
import { publicProfilesEnabled } from "~/server/features";
import { getCurrentOfficers } from "~/server/loaders/officers";
import {
  getPublicHandlesByUserId,
  getPublicProfileActivity,
  getPublicProfileByHandle,
  listPublicProfiles,
} from "~/server/loaders/publicProfiles";
import type { Block, Entry, Field } from "../blocks";
import { gatedBy, NOT_FOUND, page, terminal } from "../define";

/**
 * The community paths, behind the same `publicProfilesEnabled` switch as
 * their pages and switched off the same way: `/community` redirects to the
 * Involvement Network roster and profiles 404.
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
          ],
        },
      );
    }
    if (activity.contributions) {
      body.push({ type: "heading", text: "contributions" });
      if (activity.contributions.length === 0) {
        body.push({
          type: "text",
          text: "No merged pull requests yet.",
          tone: "dim",
        });
      } else {
        body.push({
          type: "entries",
          items: activity.contributions.map((pr) => ({
            label: pr.title.trim() || `Pull request #${pr.number}`,
            meta: `${pr.repo} #${pr.number}`,
            headline: formatEventDate(pr.mergedAt),
            text: pr.url,
          })),
          empty: "",
        });
      }
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
