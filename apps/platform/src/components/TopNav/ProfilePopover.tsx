"use client";

import Link from "next/link";
import { NavigationMenu } from "radix-ui";
import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  type PointerEvent,
} from "react";
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
import { PROFILE_MENU, useNavPanelRef, useNavShell } from "./NavShell";
import { NAV_CONTENT, NAV_SUB_ARROW, NAV_SUB_ARROW_TRACK } from "./navPanel";
import { useVerification, type NavUserClientData } from "./NavUserProvider";
import { POPOVER_DIVIDER, POPOVER_ROW } from "./popoverRow";
import { useMenuBox } from "./useMenuBox";
import VerificationAlert from "./VerificationAlert";

interface Props {
  user: NavUserClientData;
  /** The viewer's own pages, listed flat under the sub-menus. */
  items: NavItem[];
  /** Console pages this viewer may see — already filtered server-side. */
  consoleItems: ConsoleItem[];
}

/** How long a sub-menu waits, after the pointer leaves, before closing. */
const CLOSE_DELAY = 150;

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
 *
 * The sub-menu's open state is held here rather than left to Radix. A
 * NavigationMenu.Sub deliberately has no close-on-leave: it provides its
 * provider with `onTriggerEnter` and nothing else, because the tier it was
 * written for is a permanent row of tabs, where there is nowhere to leave TO.
 * Inside a card there very much is, and a sub-panel that stays open after the
 * pointer has wandered down to Sign Out is a sub-panel nobody is reading. So
 * the value is controlled, and leaving the region that owns it — its triggers,
 * its panel, and the gap between the two — starts a short timer, long enough
 * to cross that gap and no longer.
 */
export default function ProfilePopover({ user, items, consoleItems }: Props) {
  const verification = useVerification();
  const shell = useNavShell();
  const panelRef = useNavPanelRef();
  const subRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef(0);
  const [subValue, setSubValue] = useState("");
  // The sub-menu is its own tier with its own viewport, so it needs the same
  // word that a panel has arrived that the shell needs. See NavShell.
  const [subRevision, subPanelChanged] = useReducer((n: number) => n + 1, 0);
  const subPanelRef = useCallback(() => subPanelChanged(), [subPanelChanged]);

  // The sub-menu only exists inside an open profile menu. Clearing it as the
  // profile menu closes is what stops the next open from arriving with a
  // sub-panel already hanging off it. Adjusting state during the render that
  // reveals the change beats an effect, which would paint the stale panel
  // once first.
  if (shell.value !== PROFILE_MENU && subValue !== "") setSubValue("");

  const { box, travelling, settle } = useMenuBox({
    containerRef: subRef,
    value: subValue,
    triggerSelector: "[data-nav-sub-trigger]",
    revision: subRevision,
  });

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  function keepOpen() {
    window.clearTimeout(closeTimer.current);
  }

  function closeSoon(event: PointerEvent) {
    // Touch has no hover to leave; a tap-opened sub-menu closing on the
    // pointer-up that opened it would be unusable.
    if (event.pointerType !== "mouse") return;
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setSubValue(""), CLOSE_DELAY);
  }

  return (
    // A div, not the <li> a NavigationMenu.Item is by default: this sits
    // inside the navbar's right-hand cluster, which is already one <li>, and
    // an <li> in an <li> is not markup. Radix's collection is context rather
    // than DOM shape, so the item is none the wiser.
    <NavigationMenu.Item asChild value={PROFILE_MENU}>
      <div className="flex items-center">
        <NavMenuTrigger
          href="/account"
          value={PROFILE_MENU}
          align="end"
          className="flex shrink-0 items-center rounded-full text-3xl/0 transition-opacity hover:opacity-85"
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

        <NavigationMenu.Content
          ref={panelRef}
          data-slot="nav-content"
          className={NAV_CONTENT}
        >
          <NavigationMenu.Sub
            ref={subRef}
            orientation="vertical"
            value={subValue}
            onValueChange={setSubValue}
            className="relative"
          >
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

              <NavigationMenu.List
                onPointerEnter={keepOpen}
                onPointerLeave={closeSoon}
              >
                <NavSubMenu {...COMPETITION_GROUP} panelRef={subPanelRef} />
                <NavSubMenu
                  {...CONSOLE_GROUP}
                  items={consoleItems}
                  panelRef={subPanelRef}
                />
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

            <NavigationMenu.Indicator
              data-slot="nav-sub-indicator"
              className={NAV_SUB_ARROW_TRACK}
            >
              <span className={NAV_SUB_ARROW} />
            </NavigationMenu.Indicator>

            {/* Out of flow, off the card's left edge. In flow it was measured
                as part of this panel, so opening a sub-menu grew the panel and
                the viewport above resized and slid to match — the card visibly
                moved when nothing about the card had changed.

                After the card in the DOM, so the sub-panel paints over the
                arrow and hides the half of it that is not a chevron. And
                `box-content pr-2` rather than `mr-2`, so the gap the arrow
                crosses is inside the viewport's own box: Radix cancels its
                close timer on the viewport's pointerenter, which is what makes
                that gap crossable rather than a trapdoor. */}
            <NavigationMenu.Viewport
              data-slot="nav-sub-viewport"
              data-travelling={travelling || undefined}
              onAnimationEnd={settle}
              onPointerEnter={keepOpen}
              onPointerLeave={closeSoon}
              style={
                box === null
                  ? { visibility: "hidden" }
                  : { width: `${box.width}px`, height: `${box.height}px` }
              }
              className="data-[state=closed]:animate-nav-sub-fold-out data-[state=open]:animate-nav-sub-fold-in absolute top-0 right-full box-content origin-right pr-2 transition-none data-[travelling]:transition-[width,height] data-[travelling]:duration-200 data-[travelling]:ease-out"
            />
          </NavigationMenu.Sub>
        </NavigationMenu.Content>
      </div>
    </NavigationMenu.Item>
  );
}
