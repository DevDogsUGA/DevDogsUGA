import type {
  PublicProfile,
  PublicProfileLink,
} from "~/server/loaders/publicProfiles";
import { isValidLinkUrl } from "~/lib/validation/profile";

/**
 * Pure shaping for the public profile page, kept out of the components so the
 * "each field appears only when the loader returned it" rule can be tested.
 */

/** What the page calls the member: their name, else `@handle`. */
export function headingFor(profile: PublicProfile): string {
  return profile.displayName ?? `@${profile.handle}`;
}

export interface ProfileLinkItem {
  label: string;
  /** Null for an account that has no URL we can derive (Discord, LinkedIn). */
  href: string | null;
}

/**
 * Custom links followed by the connected accounts the member shows. The links
 * loader returns null when the member hides links, and the connected-account
 * columns come back null with it, so one flag covers both.
 *
 * A custom link is re-checked for an http(s) scheme even though it was
 * validated on write: this is the one place a stored value becomes an `href`
 * on a public page, so a `javascript:` row can never render as a link.
 */
export function linkItemsFor(
  profile: PublicProfile,
  links: PublicProfileLink[] | null,
): ProfileLinkItem[] {
  if (!links) return [];
  const items: ProfileLinkItem[] = links
    .filter((link) => isValidLinkUrl(link.url))
    .map((link) => ({ label: link.title, href: link.url }));
  if (profile.githubHandle) {
    items.push({
      label: `GitHub: ${profile.githubHandle}`,
      href: `https://github.com/${encodeURIComponent(profile.githubHandle)}`,
    });
  }
  if (profile.discordHandle) {
    items.push({ label: `Discord: ${profile.discordHandle}`, href: null });
  }
  if (profile.linkedinName) {
    items.push({ label: `LinkedIn: ${profile.linkedinName}`, href: null });
  }
  return items;
}

/**
 * Title and description for `<head>`, from public fields only. The description
 * is the bio when shown, trimmed to a snippet length, else a neutral line.
 */
export function metadataFor(profile: PublicProfile): {
  title: string;
  description: string;
} {
  const heading = headingFor(profile);
  const bio = profile.bio?.replace(/\s+/g, " ").trim();
  const description = bio
    ? bio.length > 160
      ? `${bio.slice(0, 157).trimEnd()}...`
      : bio
    : `${heading} is a member of DevDogs at UGA.`;
  return { title: `${heading} | DevDogs`, description };
}
