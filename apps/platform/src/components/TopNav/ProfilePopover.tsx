"use client";
import Link from "next/link";
import { NavigationMenu } from "radix-ui";
import {
  HouseIcon,
  SealCheckIcon,
  SignOutIcon,
} from "@phosphor-icons/react/ssr";
import { DASHBOARD_HOME } from "~/config/dashboard";
import { cn } from "~/lib/cn";
import signOut from "~/server/actions/signOut";
import NavAvatar from "./NavAvatar";
import NavMenuTrigger from "./NavMenuTrigger";
import { PROFILE_MENU, useNavPanelRef } from "./NavShell";
import { NAV_CLIP, NAV_OPEN_CONTENT } from "./navPanel";
import {
  useClearMe,
  useVerification,
  type NavUserClientData,
} from "./NavUserProvider";
import { POPOVER_DIVIDER, POPOVER_ROW } from "./popoverRow";
import "./topnav.css";

/** The member menu: identity, Dashboard and sign out. Setup lives on the Overview. */
export default function ProfilePopover({ user }: { user: NavUserClientData }) {
  const verification = useVerification();
  const clearMe = useClearMe();
  const panelRef = useNavPanelRef();
  return (
    <NavigationMenu.Item asChild value={PROFILE_MENU}>
      <div className="flex items-center">
        <NavMenuTrigger
          align="end"
          className="tn-avatar-trigger z-10 flex shrink-0 items-center bg-transparent p-0 transition-opacity hover:opacity-85"
        >
          <span className="sr-only">
            {user.profile.preferredName}
            {verification?.isVerified === false && ". Account setup incomplete"}
          </span>
          <NavAvatar
            userId={user.profile.userId}
            preferredName={user.profile.preferredName}
            warning={verification?.isVerified === false}
          />
        </NavMenuTrigger>
        <NavigationMenu.Content
          ref={panelRef}
          data-slot="nav-content"
          className={NAV_OPEN_CONTENT}
        >
          <div
            aria-hidden
            style={{
              left: "var(--nav-band-left, 0px)",
              right: "calc(-1 * var(--nav-right-gap, 0px))",
            }}
            className="absolute bottom-full h-18"
          />
          <div className={NAV_CLIP}>
            <div data-nav-sizer className="w-3xs py-1.5 text-sm font-medium">
              <div className="tn-who">
                <b>{user.profile.preferredName}</b>
                <span>
                  {user.highestRole.title}
                  {verification?.isVerified && (
                    <SealCheckIcon weight="bold" className="ok size-3" />
                  )}
                </span>
              </div>
              <NavigationMenu.Link asChild>
                <Link href={DASHBOARD_HOME} className={POPOVER_ROW}>
                  <HouseIcon weight="bold" />
                  Dashboard
                </Link>
              </NavigationMenu.Link>
              <hr className={POPOVER_DIVIDER} />
              <form
                action={(data) => {
                  const signingOut = signOut(data);
                  clearMe();
                  return signingOut;
                }}
              >
                <input name="callbackPath" value="/" type="hidden" />
                <button className={cn(POPOVER_ROW, "danger")} type="submit">
                  <SignOutIcon weight="bold" />
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </NavigationMenu.Content>
      </div>
    </NavigationMenu.Item>
  );
}
