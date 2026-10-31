import type { rules } from "~/server/auth/access";
import type { NavIcon } from "./nav";

/** Display order, including the Overview group reserved for B3. */
export const DASHBOARD_GROUPS = [
  "Overview",
  "Account",
  "Projects",
  "Developer",
  "Console",
] as const;

/** Navigation data is safe to import in clients; only the server resolves rules. */
export interface DashboardSection {
  id: string;
  label: string;
  icon: NavIcon;
  description: string;
  group: (typeof DASHBOARD_GROUPS)[number];
  href: string;
  dashboardHref: string;
  access: "member" | keyof typeof rules;
  refusal: "forbidden" | "notFound";
}

/** Today's URLs stay in use until B2 flips href to dashboardHref. */
export const DASHBOARD_SECTIONS: readonly DashboardSection[] = [
  {
    id: "profile",
    label: "Profile",
    icon: "UserIcon",
    description: "Manage your details, public profile and handle.",
    group: "Account",
    href: "/settings/profile",
    dashboardHref: "/dashboard/profile",
    access: "member",
    refusal: "forbidden",
  },
  {
    id: "accounts",
    label: "Connected accounts",
    icon: "LinkSimpleIcon",
    description: "Link GitHub, Discord and LinkedIn.",
    group: "Account",
    href: "/settings/accounts",
    dashboardHref: "/dashboard/accounts",
    access: "member",
    refusal: "forbidden",
  },
  {
    id: "attendance",
    label: "Attendance passport",
    icon: "StarIcon",
    description: "Check in and track your participation passport.",
    group: "Account",
    href: "/attendance",
    dashboardHref: "/dashboard/attendance",
    access: "member",
    refusal: "forbidden",
  },
  {
    id: "projects",
    label: "Projects",
    icon: "FolderSimpleIcon",
    description: "Your projects and reports.",
    group: "Projects",
    href: "/projects",
    dashboardHref: "/dashboard/projects",
    access: "member",
    refusal: "forbidden",
  },
  // TODO(D3): reveal the review queue to advisors and report reviewers.
  {
    id: "reviews",
    label: "Review queue",
    icon: "FolderSimpleIcon",
    description: "Review project proposals and reports.",
    group: "Projects",
    href: "/console/projects",
    dashboardHref: "/dashboard/reviews",
    access: "officer",
    refusal: "forbidden",
  },
  {
    id: "oauth",
    label: "OAuth apps",
    icon: "KeyIcon",
    description: "Manage your OAuth clients.",
    group: "Developer",
    href: "/settings/oauth",
    dashboardHref: "/dashboard/oauth",
    access: "member",
    refusal: "forbidden",
  },
  {
    id: "meetings",
    label: "Meetings",
    icon: "CalendarCheckIcon",
    description:
      "Present live meeting QR codes, numeric codes, and attendance totals.",
    group: "Console",
    href: "/console/attendance",
    dashboardHref: "/dashboard/meetings",
    access: "useGraphics",
    refusal: "forbidden",
  },
  {
    id: "graphics",
    label: "Graphics",
    icon: "ImageIcon",
    description:
      "Club logos, banners and app icons to download. Each meeting's page has its own graphics.",
    group: "Console",
    href: "/console/graphics",
    dashboardHref: "/dashboard/graphics",
    access: "useGraphics",
    refusal: "forbidden",
  },
  {
    id: "data",
    label: "Data tools",
    icon: "UploadSimpleIcon",
    description:
      "Import attendance sheets and the Involvement roster from CSV, with a preview before anything changes.",
    group: "Console",
    href: "/console/data",
    dashboardHref: "/dashboard/data",
    access: "manageAttendance",
    refusal: "forbidden",
  },
  {
    id: "qr",
    label: "QR codes",
    icon: "QrCodeIcon",
    description:
      "Deprecated: use `backstage qr`. Generate branded QR codes for attendance, posters, and other club materials.",
    group: "Console",
    href: "/console/qr",
    dashboardHref: "/dashboard/qr",
    access: "manageAttendance",
    refusal: "forbidden",
  },
  {
    id: "reflections",
    label: "Reflections",
    icon: "NotePencilIcon",
    description: "Set the word minimum and submission window for reflections.",
    group: "Console",
    href: "/console/reflections",
    dashboardHref: "/dashboard/reflections",
    access: "manageAttendance",
    refusal: "forbidden",
  },
  {
    id: "schedule",
    label: "Schedule editor",
    icon: "CalendarDotsIcon",
    description:
      "Propose changes to meetings, workshops and venues. Edits are saved privately; Open PR sends them to GitHub for review.",
    group: "Console",
    href: "/console/meetings",
    dashboardHref: "/dashboard/schedule",
    access: "officer",
    refusal: "forbidden",
  },
  {
    id: "badges",
    label: "Badges",
    icon: "SealCheckIcon",
    description:
      "Award Workshop Host, Guide Author, Mentor and Event Organizer badges with a public citation, or withdraw one.",
    group: "Console",
    href: "/console/badges",
    dashboardHref: "/dashboard/badges",
    access: "officer",
    refusal: "forbidden",
  },
  {
    id: "permissions",
    label: "Permissions",
    icon: "ShieldCheckIcon",
    description:
      "Every member starts with no permissions; President holds all of them and is assigned on Discord.",
    group: "Console",
    href: "/console/permissions",
    dashboardHref: "/dashboard/permissions",
    access: "manageRoles",
    refusal: "forbidden",
  },
  {
    id: "moderation",
    label: "Moderation",
    icon: "FlagIcon",
    description:
      "Review content reports filed against community profiles and resolve them with the appropriate action.",
    group: "Console",
    href: "/console/moderation",
    dashboardHref: "/dashboard/moderation",
    access: "moderate",
    refusal: "forbidden",
  },
  {
    id: "audit-log",
    label: "Audit log",
    icon: "ListMagnifyingGlassIcon",
    description:
      "A record of moderation actions and content reports filed across all production OAuth clients.",
    group: "Console",
    href: "/console/audit-log",
    dashboardHref: "/dashboard/audit-log",
    access: "viewAuditLog",
    refusal: "forbidden",
  },
  {
    id: "apps",
    label: "Apps",
    icon: "AppWindowIcon",
    description:
      "Publish OAuth apps, return them to Testing, transfer them to DevDogs and choose which skip the consent screen.",
    group: "Console",
    href: "/console/apps",
    dashboardHref: "/dashboard/apps",
    access: "manageOAuthApps",
    refusal: "forbidden",
  },
  {
    id: "docs-preview",
    label: "Docs preview",
    icon: "BookOpenIcon",
    description:
      "Read docs pages scheduled for later, marked with when they go live. Anyone without access gets a 404.",
    group: "Console",
    href: "/preview/docs",
    dashboardHref: "/dashboard/docs-preview",
    access: "previewDocs",
    refusal: "notFound",
  },
];

/** The user menu opens the member profile until B3 adds the overview. */
export const DASHBOARD_HOME = DASHBOARD_SECTIONS.find(
  (section) => section.id === "profile",
)!.href;
