import type { StaticImageData } from "next/image";
import gdgFavicon from "~/assets/favicons/gdg.png";
import googleFormsFavicon from "~/assets/favicons/google-forms.png";
import involvementFavicon from "~/assets/favicons/involvement-network.png";
import { mayUseGraphics } from "~/lib/graphicsAccess";
import type { ResolvedPermissions } from "~/server/actions/permissions";
import type * as icons from "./icons";
import { SOCIALS } from "./socials";

export type NavIcon = keyof typeof icons;

/**
 * DevDogs on the UGA Involvement Network, the roster that decides official
 * membership. `/join` redirects here, so keep the two in sync by importing
 * this rather than retyping the URL.
 */
export const INVOLVEMENT_NETWORK_URL =
  "https://uga.campuslabs.com/engage/organization/devdogs";

/**
 * The events tab of the same Involvement Network listing. Event pages link here
 * for RSVPs and as a fallback when the platform schedule is unavailable.
 */
export const INVOLVEMENT_NETWORK_EVENTS_URL = `${INVOLVEMENT_NETWORK_URL}/events`;

/**
 * The roster tab of the same Involvement Network listing. `/community`
 * redirects here wherever public profiles are switched off
 * (`publicProfilesEnabled` in `server/features.ts`).
 */
export const INVOLVEMENT_NETWORK_ROSTER_URL = `${INVOLVEMENT_NETWORK_URL}/roster`;

export interface NavItem {
  label: string;
  href: string;
  icon: NavIcon;
  description?: string;
}

export interface ConsoleItem extends NavItem {
  /**
   * The permission flag that reveals this item, or `graphics` for the pages
   * any officer may open (see `mayUseGraphics`).
   */
  permission: keyof ResolvedPermissions | "graphics";
}

export interface SwitcherEntry {
  label: string;
  href: string;
  icon?: NavIcon;
  /** The destination's own favicon, shown on the switcher's listing rows. */
  favicon?: StaticImageData;
  description?: string;
  external?: true;
  /**
   * A time-sensitive switcher row: filled amber instead of white, with its
   * `description` as a second line. Drop the flag (or the entry) once the
   * date passes.
   */
  featured?: true;
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
  {
    label: "Terms of Service",
    href: "/legal/terms",
    icon: "ScrollIcon",
    description: "The rules for using DevDogs, its platform, and its apps.",
  },
  {
    label: "Changelog",
    href: "/changelog",
    icon: "TerminalWindowIcon",
    description:
      "The weekly DevDogs newsletter: what the club is building and where to show up.",
  },
  {
    label: "GDGC Newsletter",
    href: "/newsletters/gdgc",
    icon: "EnvelopeSimpleIcon",
    description: "GDG on Campus UGA opportunities, civic projects and events.",
  },
];

/**
 * Items in the Console dropdown. Each is gated by the permission that the page
 * itself enforces server-side. Keep these in sync with the page loaders.
 */
export const CONSOLE_ITEMS: ConsoleItem[] = [
  {
    label: "Attendance",
    href: "/console/attendance",
    icon: "QrCodeIcon",
    permission: "canManageAttendance",
    description:
      "Present live meeting QR codes, numeric codes, and attendance totals.",
  },
  {
    label: "Graphics",
    href: "/console/graphics",
    icon: "ImageIcon",
    permission: "graphics",
    description:
      "Club logos, banners and app icons to download. Each meeting's page has its own graphics.",
  },
  {
    label: "Reflections",
    href: "/console/reflections",
    icon: "NotePencilIcon",
    permission: "canManageAttendance",
    description: "Set the word minimum and submission window for reflections.",
  },
  {
    label: "QR Codes",
    href: "/console/qr",
    icon: "QrCodeIcon",
    permission: "canManageAttendance",
    description:
      "Deprecated: use `backstage qr`. Generate branded QR codes for attendance, posters, and other club materials.",
  },
  {
    label: "Moderation",
    href: "/console/moderation",
    icon: "ShieldIcon",
    permission: "canModerate",
    description:
      "Review content reports filed against community profiles and resolve them with the appropriate action.",
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
    label: "Docs preview",
    href: "/preview/docs",
    icon: "BookOpenIcon",
    permission: "canPreviewDocs",
    description:
      "Read docs pages scheduled for later, marked with when they go live. Anyone without access gets a 404.",
  },
  {
    label: "Permissions",
    href: "/console/permissions",
    icon: "LockIcon",
    permission: "canManageRoles",
    description:
      "Every member starts with no permissions; President holds all of them and is assigned on Discord.",
  },
];

/** Signed-in-only pages listed at the top level of the profile popover. */
export const ACCOUNT_ITEMS: NavItem[] = [
  {
    label: "Attendance",
    href: "/attendance",
    icon: "StarIcon",
    description:
      "Check in with the meeting code and track your participation passport.",
  },
  {
    label: "Profile",
    href: "/settings/profile",
    icon: "UserIcon",
    description:
      "Manage your details, what your public profile shows, and your handle.",
  },
  {
    label: "Connected accounts",
    href: "/settings/accounts",
    icon: "SealCheckIcon",
    description:
      "Link GitHub, Discord and LinkedIn, and see what verification needs.",
  },
  {
    label: "OAuth apps",
    href: "/settings/oauth",
    icon: "KeyIcon",
    description:
      "Set up a local OAuth client to test DevDogs sign-in from your own project.",
  },
];

/**
 * Every signed-in-only page, in menu order. The profile popover splits these
 * back apart. Search and the mobile sheet want one flat list and read this, so
 * a page added to either half above is picked up by both without a second edit.
 */
export const PROFILE_ITEMS: NavItem[] = [...ACCOUNT_ITEMS];

/**
 * A named sub-menu inside the profile popover.
 *
 * `iconBg` is the fill behind every row's mark, so a sub-menu's rows read as
 * one set. Per group rather than per item, since these pages have no identity
 * of their own to carry a colour for.
 */
export interface NavGroup {
  label: string;
  iconBg: string;
  items: NavItem[];
  /**
   * Split the panel into two columns where the viewport is wide enough to
   * take it. For a group long enough to want it, like the Console's six, one
   * 20rem column of described rows is a scroll masquerading as a menu.
   */
  twoColumn?: boolean;
}

/**
 * The Console sub-menu's label and fill. Its items are missing because they are
 * permission-filtered per request: `visibleConsoleItems` resolves them
 * server-side and they reach the popover as props.
 */
export const CONSOLE_GROUP: Omit<NavGroup, "items"> = {
  label: "Console",
  iconBg: "bg-[var(--brand-kind-info-6)]",
  twoColumn: true,
};

/** Primary call-to-action in the app switcher. */
export const SWITCHER_PRIMARY: SwitcherEntry = {
  label: "Join DevDogs",
  href: "/join",
};

/**
 * External listings, shown in the app switcher. Projects are not listed here.
 * The switcher renders them as cards from `~/config/projects`.
 */
export const SWITCHER_LINKS: SwitcherEntry[] = [
  {
    label: "Georgia 311 Application",
    href: "/georgia311",
    favicon: googleFormsFavicon,
    description: "Civic hackathon · apply by Thu, Oct 15",
    external: true,
    featured: true,
  },
  {
    label: "Georgia 311 Virtual Meeting",
    href: "https://gdg.community.dev/events/details/google-gdg-on-campus-university-of-georgia-athens-united-states-presents-georgia-311-challenge-interest-meeting-virtual-oct-11/",
    favicon: gdgFavicon,
    description: "Interest meeting · Sun, Oct 11, 5 PM",
    external: true,
    featured: true,
  },
  {
    label: "UGA Involvement Network Listing",
    href: INVOLVEMENT_NETWORK_URL,
    favicon: involvementFavicon,
    external: true,
  },
  {
    label: "GDG on Campus: UGA Listing",
    href: "https://gdg.community.dev/gdg-on-campus-university-of-georgia-athens-united-states/",
    favicon: gdgFavicon,
    external: true,
  },
];

/**
 * Social channels, shown in the app switcher, mobile sheet, and footer: each
 * through its short redirect (see `~/config/socials`), then email.
 */
export const SOCIAL_LINKS: SwitcherEntry[] = [
  ...SOCIALS.map(({ label, path, icon }) => ({
    label,
    href: path,
    icon,
    external: true as const,
  })),
  {
    label: "Email",
    href: "mailto:devdogs@uga.edu",
    icon: "EnvelopeSimpleIcon",
    external: true,
  },
];

/** Filters CONSOLE_ITEMS down to what the caller may see. */
export function visibleConsoleItems(
  permissions: ResolvedPermissions | null,
  isLeader = false,
): ConsoleItem[] {
  if (!permissions) return [];
  return CONSOLE_ITEMS.filter((item) =>
    item.permission === "graphics"
      ? mayUseGraphics({
          isLeader,
          canManageAttendance: permissions.canManageAttendance,
        })
      : permissions[item.permission],
  );
}
