"use client";

import Link from "next/link";
import { NavigationMenu } from "radix-ui";
import {
  SealCheckIcon,
  SignOutIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react/ssr";
import Avatar from "~/components/AvatarField/Avatar";
import * as icons from "~/config/icons";
import {
  COMPETITION_GROUP,
  CONSOLE_GROUP,
  type ConsoleItem,
  type NavItem,
} from "~/config/nav";
import signOut from "~/server/actions/signOut";
import NavMenuTrigger from "./NavMenuTrigger";
import NavSubMenu from "./NavSubMenu";
import { PROFILE_MENU } from "./NavShell";
import { NAV_CONTENT } from "./navPanel";
import { useVerification, type NavUserClientData } from "./NavUserProvider";
import { POPOVER_DIVIDER, POPOVER_ROW } from "./popoverRow";
import VerificationAlert from "./VerificationAlert";

interface Props {
  user: NavUserClientData;
  /** The viewer's own pages, listed flat under the sub-menus. */
  items: NavItem[];
  /** Console pages this viewer may see — already filtered server-side. */
  consoleItems: ConsoleItem[];
}

/**
 * The avatar menu, as an item of the navbar's own list.
 *
 * It was a DropdownMenu, which opens on click and owns its own popper. Sharing
 * the navbar's viewport means giving that up: the panel is now a Content that
 * Radix hoists into the same box Docs renders into, so hovering from one to
 * the other slides one surface across rather than swapping two.
 *
 * The cost is that this is navigation now, not a menu — no role="menu", no
 * arrow-key roving between rows. That is the honest description of what it
 * holds. Sign Out is the one exception, an action among links, and it stays a
 * real form submit rather than being dressed as a link.
 */
export default function ProfilePopover({ user, items, consoleItems }: Props) {
  const verification = useVerification();

  return (
    <NavigationMenu.Item value={PROFILE_MENU}>
      <NavMenuTrigger
        href="/account"
        value={PROFILE_MENU}
        className="relative flex shrink-0 items-center rounded-full text-3xl/0 transition-opacity hover:opacity-85"
      >
        {/* The link's accessible name. Radix puts `aria-expanded` alongside
            it, so a screen reader gets both what it goes to and that it also
            opens something. */}
        <span className="sr-only">{user.profile.preferredName}</span>
        <Avatar
          userId={user.profile.userId}
          preferredName={user.profile.preferredName}
        />
        {verification?.isVerified === false && (
          <span className="absolute -right-0.5 -bottom-0.5 flex size-3 items-center justify-center rounded-full bg-mauve-950">
            <WarningCircleIcon className="size-2.5 text-amber-400" />
          </span>
        )}
      </NavMenuTrigger>

      <NavigationMenu.Content data-slot="nav-content" className={NAV_CONTENT}>
        {/* The sub-menu viewport is a sibling of the card, in flow and to its
            left, rather than floating over the page. It has to be: the tier-1
            viewport sizes itself to this content, so a sub-panel positioned
            out of flow would be measured as zero and clipped away. In flow,
            opening a sub-menu simply makes this row wider, the tier-1 viewport
            grows to match, and because that viewport is clamped against the
            right edge it grows leftward and the card does not move. */}
        <NavigationMenu.Sub
          orientation="vertical"
          className="flex items-start gap-2"
        >
          <NavigationMenu.Viewport
            data-slot="nav-sub-viewport"
            className="data-[state=closed]:animate-nav-sub-fold-out data-[state=open]:animate-nav-sub-fold-in h-(--radix-navigation-menu-viewport-height) w-(--radix-navigation-menu-viewport-width) origin-right transition-[width,height] duration-200 ease-out"
          />

          <div className="w-3xs rounded-md border-2 bg-mauve-950/90 py-1.5 text-sm font-medium text-white backdrop-blur">
            <div className="flex flex-col px-3 pt-1 pb-2">
              <span className="truncate text-sm text-white">
                {user.profile.preferredName}
              </span>
              <span className="flex items-center gap-1 text-xs text-mauve-400">
                {user.highestRole.title}
                {verification?.isVerified && (
                  <SealCheckIcon className="size-3 text-emerald-400" />
                )}
              </span>
            </div>

            {verification && !verification.isVerified && (
              <div className="px-1.5 pb-1.5">
                <VerificationAlert />
              </div>
            )}

            <NavigationMenu.List>
              <NavSubMenu {...COMPETITION_GROUP} />
              <NavSubMenu {...CONSOLE_GROUP} items={consoleItems} />
            </NavigationMenu.List>

            {/* Competitions is two static pages, so there is always a row
                above this even where an unpermissioned Console renders
                nothing and the band collapses to one. */}
            <div className={POPOVER_DIVIDER} />

            {items.map((item) => {
              const Icon = icons[item.icon];
              return (
                <NavigationMenu.Link key={item.href} asChild>
                  <Link href={item.href} className={POPOVER_ROW}>
                    <Icon />
                    {item.label}
                  </Link>
                </NavigationMenu.Link>
              );
            })}

            <div className={POPOVER_DIVIDER} />

            <form action={signOut}>
              <input name="callbackPath" value="/" type="hidden" />
              <button
                className={`${POPOVER_ROW} text-rose-300 hover:bg-rose-950 hover:text-rose-50`}
                type="submit"
              >
                <SignOutIcon />
                Sign Out
              </button>
            </form>
          </div>
        </NavigationMenu.Sub>
      </NavigationMenu.Content>
    </NavigationMenu.Item>
  );
}
