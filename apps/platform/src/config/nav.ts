import type { StaticImageData } from "next/image";
import gdgFavicon from "~/assets/favicons/gdg.png";
import involvementFavicon from "~/assets/favicons/involvement-network.png";
import type { ResolvedPermissions } from "~/server/actions/permissions";
import type * as icons from "./icons";

export type NavIcon = keyof typeof icons;

/**
 * DevDogs on the UGA Involvement Network — the roster that decides official
 * membership (see `docs/platform/airtable-setup.md`). `/join` redirects here,
 * so keep the two in sync by importing this rather than retyping the URL.
 */
export const INVOLVEMENT_NETWORK_URL =
  "https://uga.campuslabs.com/engage/organization/devdogs";

/**
 * The events tab of the same Involvement Network listing. `/events` redirects
 * here while the platform's own events page is under construction.
 */
export const INVOLVEMENT_NETWORK_EVENTS_URL = `${INVOLVEMENT_NETWORK_URL}/events`;

export interface NavItem {
  label: string;
  href: string;
  icon: NavIcon;
  description?: string;
}

export interface ConsoleItem extends NavItem {
  /**
   * The permission flag that reveals this item, or "credentialsAccess" for the
   * Credentials page, which is visible to anyone with role-granted credentials
   * (resolved server-side via `canSeeCredentialsPage`).
   */
  permission: keyof ResolvedPermissions | "credentialsAccess";
}

export interface SwitcherEntry {
  label: string;
  href: string;
  icon?: NavIcon;
  /** The destination's own favicon, shown on the switcher's listing rows. */
  favicon?: StaticImageData;
  description?: string;
  external?: true;
}

/** Left-aligned navbar links. Every entry is publicly accessible. */
export const PUBLIC_LINKS: NavItem[] = [
  {
    label: "Community",
    href: "/community",
    icon: "UsersIcon",
    description: "Meet the members and leadership of DevDogs.",
  },
  {
    label: "Events",
    href: "/events",
    icon: "CalendarDotsIcon",
    description: "Upcoming meetings, workshops, and events hosted by DevDogs.",
  },
  {
    label: "Partners",
    href: "/partners",
    icon: "HandshakeIcon",
    description: "Organizations and sponsors that partner with DevDogs.",
  },
  {
    label: "Docs",
    href: "/docs",
    icon: "BookOpenIcon",
    description: "Documentation for DevDogs projects.",
  },
];

/** Public pages indexed by search but not shown in the navbar. */
export const SEARCH_ONLY_PAGES: NavItem[] = [
  {
    label: "Home",
    href: "/",
    icon: "HouseIcon",
    description:
      "DevDogs is a club at UGA devoted to bettering our community through open-source software.",
  },
  {
    label: "Privacy Policy",
    href: "/legal/privacy",
    icon: "ScalesIcon",
    description: "How DevDogs collects, uses, and protects your data.",
  },
];

/**
 * Items in the Console dropdown. Each is gated by the permission that the
 * page itself enforces server-side — keep these in sync with the page loaders.
 */
export const CONSOLE_ITEMS: ConsoleItem[] = [
  {
    label: "Moderation",
    href: "/console/moderation",
    icon: "ShieldIcon",
    permission: "canModerate",
    description:
      "Review content reports filed against community profiles and resolve them with the appropriate action.",
  },
  {
    label: "Credentials",
    href: "/console/credentials",
    icon: "KeyIcon",
    permission: "credentialsAccess",
    description:
      "Shared accounts and secrets used for testing integrations, visible only to roles you grant access to.",
  },
  {
    label: "Audit Log",
    href: "/console/audit-log",
    icon: "FileTextIcon",
    permission: "canViewAuditLog",
    description:
      "A record of moderation actions and content reports filed across all production OAuth clients.",
  },
  {
    label: "Verification",
    href: "/console/verification",
    icon: "SealCheckIcon",
    permission: "canManageVerification",
    description:
      "Upload the UGA Involvement Network roster to verify member profiles and unlock community page visibility.",
  },
  {
    label: "Airtable Sync",
    href: "/console/airtable",
    icon: "ArrowSquareOutIcon",
    permission: "canTriggerSync",
    description:
      "Run the Airtable sync by hand and see what the last pass refused.",
  },
  {
    label: "Permissions",
    href: "/console/permissions",
    icon: "LockIcon",
    permission: "canManageRoles",
    description:
      "Every member starts with no permissions; Root has all permissions and can only change hands via transfer.",
  },
];

/** Signed-in-only pages, listed inside the profile popover. */
export const PROFILE_ITEMS: NavItem[] = [
  {
    label: "Vote",
    href: "/vote",
    icon: "StarIcon",
    description:
      "Rank the competing implementations in any election you can vote in.",
  },
  {
    label: "Team requests",
    href: "/teams/requests",
    icon: "UsersIcon",
    description:
      "Invitations addressed to you, and join requests on teams you lead.",
  },
  {
    label: "Account",
    href: "/account",
    icon: "UserIcon",
    description:
      "Manage your profile information, connected accounts, and verification status.",
  },
  {
    label: "OAuth Client",
    href: "/tools/oauth",
    icon: "KeyIcon",
    description:
      "Set up a local OAuth client to test DevDogs sign-in from your own project.",
  },
];

/** Primary call-to-action in the app switcher. */
export const SWITCHER_PRIMARY: SwitcherEntry = {
  label: "Join DevDogs",
  href: "/join",
};

/**
 * External listings, shown in the app switcher. Projects are not listed here —
 * the switcher renders them as cards from `~/config/projects`.
 */
export const SWITCHER_LINKS: SwitcherEntry[] = [
  {
    label: "UGA Involvement Network Listing",
    href: INVOLVEMENT_NETWORK_URL,
    favicon: involvementFavicon,
    external: true,
  },
  {
    label: "Google GDG on Campus: UGA Listing",
    href: "https://gdg.community.dev/gdg-on-campus-university-of-georgia-athens-united-states/",
    favicon: gdgFavicon,
    external: true,
  },
];

/** Social channels, shown in the app switcher, mobile sheet, and footer. */
export const SOCIAL_LINKS: SwitcherEntry[] = [
  {
    label: "Instagram",
    href: "https://instagram.com/DevDogsUGA",
    icon: "InstagramLogoIcon",
    external: true,
  },
  {
    label: "LinkedIn",
    href: "https://linkedin.com/company/DevDogsUGA",
    icon: "LinkedinLogoIcon",
    external: true,
  },
  {
    label: "GitHub",
    href: "https://github.com/DevDogsUGA",
    icon: "GithubLogoIcon",
    external: true,
  },
  {
    label: "Email",
    href: "mailto:devdogs@uga.edu",
    icon: "EnvelopeSimpleIcon",
    external: true,
  },
];

/**
 * Filters CONSOLE_ITEMS down to what the caller may see. `credentialsAccess`
 * must be resolved by the caller (via `canSeeCredentialsPage`) since it goes
 * beyond the flat permission flags.
 */
export function visibleConsoleItems(
  permissions: ResolvedPermissions | null,
  credentialsAccess = false,
): ConsoleItem[] {
  if (!permissions) return [];
  return CONSOLE_ITEMS.filter((item) =>
    item.permission === "credentialsAccess"
      ? credentialsAccess
      : permissions[item.permission],
  );
}
