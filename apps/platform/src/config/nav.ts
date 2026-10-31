import type { StaticImageData } from "next/image";
import gdgFavicon from "~/assets/favicons/gdg.png";
import googleFormsFavicon from "~/assets/favicons/google-forms.png";
import involvementFavicon from "~/assets/favicons/involvement-network.png";
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

/**
 * Where Contribute leads on a page rather than a menu (the mobile sheet and
 * search): the docs landing page's Contribute group.
 */
export const CONTRIBUTE_HREF = "/docs#contribute";

export interface NavItem {
  label: string;
  href: string;
  icon: NavIcon;
  description?: string;
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
    description:
      "Workshops, shared tooling, operations, and the guides for building on DevDogs.",
  },
  {
    label: "Contribute",
    href: CONTRIBUTE_HREF,
    icon: "GithubLogoIcon",
    description:
      "How each DevDogs project works and how to contribute, written by the projects themselves.",
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

/** Primary call-to-action in the app switcher. */
export const SWITCHER_PRIMARY: SwitcherEntry = {
  label: "Join DevDogs",
  href: "/join",
};

/**
 * External listings, shown in the app switcher. Projects are not listed here.
 * The switcher renders them as cards from `getSwitcherProjects`
 * (`~/server/projects/showcase`).
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

/** The address for reaching DevDogs leadership; the footer's Email link and the access-denied cards use it. */
export const CONTACT_EMAIL = "devdogs@uga.edu";

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
    href: `mailto:${CONTACT_EMAIL}`,
    icon: "EnvelopeSimpleIcon",
    external: true,
  },
];
