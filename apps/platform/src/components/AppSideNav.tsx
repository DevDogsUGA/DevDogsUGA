import {
  BookOpenIcon,
  CalendarCheckIcon,
  FlagIcon,
  ImageIcon,
  KeyIcon,
  LinkSimpleIcon,
  ListMagnifyingGlassIcon,
  NotePencilIcon,
  QrCodeIcon,
  ShieldCheckIcon,
  UserIcon,
} from "@phosphor-icons/react/ssr";
import type { ReactNode } from "react";
import { getNavUser } from "~/components/TopNav/data";
import { mayUseGraphics } from "~/lib/graphicsAccess";
import { Avatar, AvatarFallback } from "~/ui/avatar";
import { SideWho } from "~/ui/app-shell";
import { SideNav, SideNavGroup, SideNavLink } from "~/ui/side-nav";

interface Entry {
  label: string;
  href: string;
  icon: ReactNode;
}

const ACCOUNT: Entry[] = [
  { label: "Profile", href: "/settings/profile", icon: <UserIcon /> },
  {
    label: "Connected accounts",
    href: "/settings/accounts",
    icon: <LinkSimpleIcon />,
  },
];

const DEVELOPER: Entry[] = [
  { label: "OAuth apps", href: "/settings/oauth", icon: <KeyIcon /> },
];

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]!.toUpperCase())
      .join("") || "?"
  );
}

/**
 * The app shell's side nav, shared by Settings and the Console (kit-spec
 * section 10). Server-rendered: it shows Account and Developer to every member,
 * and the Console group only to viewers whose permissions (already resolved by
 * `getNavUser`) reach a console page. Imports and Exports are not built (D5) and are
 * not listed.
 *
 * `current` is the pathname being read; the matching link is marked current.
 * A link is current for its own path and anything beneath it.
 */
export default async function AppSideNav({ current }: { current?: string }) {
  const user = await getNavUser();
  const p = user?.permissions;

  // Any officer, so graphics do not need attendance powers (Q67).
  const graphics = mayUseGraphics({
    isLeader: user?.isLeader ?? false,
    canManageAttendance: p?.canManageAttendance ?? false,
  });

  const console: (Entry | false | undefined)[] = [
    graphics && {
      label: "Meetings",
      href: "/console/attendance",
      icon: <CalendarCheckIcon />,
    },
    graphics && {
      label: "Graphics",
      href: "/console/graphics",
      icon: <ImageIcon />,
    },
    p?.canManageAttendance && {
      label: "QR codes",
      href: "/console/qr",
      icon: <QrCodeIcon />,
    },
    p?.canManageAttendance && {
      label: "Reflections",
      href: "/console/reflections",
      icon: <NotePencilIcon />,
    },
    p?.canManageRoles && {
      label: "Permissions",
      href: "/console/permissions",
      icon: <ShieldCheckIcon />,
    },
    p?.canModerate && {
      label: "Moderation",
      href: "/console/moderation",
      icon: <FlagIcon />,
    },
    p?.canViewAuditLog && {
      label: "Audit log",
      href: "/console/audit-log",
      icon: <ListMagnifyingGlassIcon />,
    },
    p?.canPreviewDocs && {
      label: "Docs preview",
      href: "/preview/docs",
      icon: <BookOpenIcon />,
    },
  ];
  const consoleEntries = console.filter((e): e is Entry => Boolean(e));

  const isCurrent = (href: string) =>
    current !== undefined &&
    (current === href || current.startsWith(`${href}/`));

  const group = (label: string, entries: Entry[]) => (
    <>
      <SideNavGroup>{label}</SideNavGroup>
      {entries.map((entry) => (
        <SideNavLink
          key={entry.href}
          href={entry.href}
          icon={entry.icon}
          active={isCurrent(entry.href)}
        >
          {entry.label}
        </SideNavLink>
      ))}
    </>
  );

  return (
    <>
      {user && (
        <SideWho
          avatar={
            <Avatar>
              <AvatarFallback>
                {initials(user.profile.preferredName)}
              </AvatarFallback>
            </Avatar>
          }
          name={user.profile.preferredName}
          handle={user.highestRole.title}
        />
      )}
      <SideNav aria-label="Settings">
        {group("Account", ACCOUNT)}
        {group("Developer", DEVELOPER)}
        {consoleEntries.length > 0 && group("Console", consoleEntries)}
      </SideNav>
    </>
  );
}
