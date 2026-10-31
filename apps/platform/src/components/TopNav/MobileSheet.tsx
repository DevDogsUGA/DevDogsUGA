"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  DotsNineIcon,
  HouseIcon,
  ListIcon,
  SignOutIcon,
} from "@phosphor-icons/react/ssr";
import { AppSwitcherTrigger } from "~/components/AppSwitcher/provider";
import * as icons from "~/config/icons";
import { PUBLIC_LINKS, SOCIAL_LINKS } from "~/config/nav";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "~/ui/sheet";
import { DASHBOARD_HOME } from "~/config/dashboard";
import { Button } from "~/ui/button";
import signOut from "~/server/actions/signOut";
import { useClearMe, type NavUserClientData } from "./NavUserProvider";
import "./topnav.css";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

/** Public navigation and the same member menu as the popover. */
export default function MobileSheet({
  user,
}: {
  user: NavUserClientData | null;
}) {
  const signedIn = user !== null;
  const clearMe = useClearMe();
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close when navigation completes (covers back/forward too).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(false);
  }, [pathname]);

  const close = () => setOpen(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label="Open menu"
        className="navtoggle btn ghost icon sm shrink-0"
      >
        <ListIcon weight="bold" />
        <span aria-hidden className="hit" />
      </SheetTrigger>

      {/* The plain panel, not the 480px drawer: it is the mockup's `.mnav`
          column, on the same side as the toggle. */}
      <SheetContent
        side="left"
        variant="panel"
        className="w-[min(20rem,calc(100vw-2rem))] gap-0 p-0"
      >
        <SheetHeader className="p-4">
          <SheetTitle className="text-left">Menu</SheetTitle>
        </SheetHeader>

        <div className="tn-mobile">
          <nav className="mnav open" aria-label="Main">
            {PUBLIC_LINKS.map((link) => {
              const active = isActive(pathname, link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={active ? "on" : undefined}
                  aria-current={active ? "page" : undefined}
                  onClick={close}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          {user && (
            <>
              <div className="tn-who">
                <b>{user.profile.preferredName}</b>
                <span>{user.highestRole.title}</span>
              </div>
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="justify-start"
              >
                <Link href={DASHBOARD_HOME} onClick={close}>
                  <HouseIcon weight="bold" />
                  Dashboard
                </Link>
              </Button>
              <form
                action={(data) => {
                  const signingOut = signOut(data);
                  clearMe();
                  close();
                  return signingOut;
                }}
              >
                <input name="callbackPath" value="/" type="hidden" />
                <Button
                  type="submit"
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start"
                >
                  <SignOutIcon weight="bold" />
                  Sign out
                </Button>
              </form>
            </>
          )}

          {!signedIn && (
            <Link
              href="/auth"
              prefetch={false}
              onClick={close}
              className="btn primary sm"
            >
              Sign in
            </Link>
          )}

          <AppSwitcherTrigger>
            <button type="button" onClick={close} className="btn secondary sm">
              <DotsNineIcon weight="bold" />
              More from DevDogs
            </button>
          </AppSwitcherTrigger>

          <div className="tn-mobile-foot">
            {SOCIAL_LINKS.map((social) => {
              const Icon = social.icon ? icons[social.icon] : null;
              return (
                <Link
                  key={social.href}
                  href={social.href}
                  target="_blank"
                  aria-label={social.label}
                  className="iconbtn"
                >
                  {Icon && <Icon />}
                </Link>
              );
            })}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
