import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { getContributeMenu, getDocsMenu } from "~/server/docs/menu";
import AppSwitcherButton from "./AppSwitcherButton";
import NavLinks, { NavLinksFallback } from "./NavLinks";
import NavShell from "./NavShell";
import { NavUserRefresh } from "./NavUserProvider";
import SearchButton from "./SearchButton";
import "./topnav.css";
import { TopNavMobile, TopNavProfile } from "./TopNavUser";

export default async function TopNav() {
  // The Docs menu is read from `docs/` at build time and the Contribute menu
  // from the Projects (cached, and tagged so an edit refreshes it); only plain
  // rows reach the client. A project whose pages are all still scheduled is
  // left out until one is live.
  const [docs, contribute] = await Promise.all([
    getDocsMenu(),
    getContributeMenu(),
  ]);
  const menus = { docs, contribute };

  return (
    <header className="sticky top-0 z-50">
      {/* Off-screen until focused (kit `.skip`); the target is the layout's
          <main id="main-content">. */}
      <a href="#main-content" className="btn secondary sm skip">
        Skip to content
      </a>
      {/* One list across the whole bar, not one on each side. Docs and the
          avatar have to sit in the same Radix collection for their panels to
          share a viewport, and a collection is a list. The toggle, brand,
          search and the app switcher are plain <li>s, which Radix's collection
          ignores. The list is the kit's `.topnav`. */}
      <NavShell>
        {/* The mobile menu toggle leads the bar at 900px and below (kit
            `.navtoggle`); wider, the button is not displayed. */}
        <li className="contents">
          <TopNavMobile />
        </li>

        <li className="topnav-brand shrink-0">
          <Link
            href="/"
            className="flex items-center"
            aria-label="DevDogs home"
          >
            <Image
              className="logo"
              alt=""
              src="/cosmic/a/devdogs-logo-dark.png"
              width={104}
              height={28}
              unoptimized
              priority
            />
          </Link>
        </li>

        <Suspense fallback={<NavLinksFallback menus={menus} />}>
          <NavLinks menus={menus} />
        </Suspense>

        {/* One item, several controls. The avatar is a menu and so has to be a
            NavigationMenu.Item, but an <li> inside an <li> is not markup, so
            that item renders as a div here. Radix's collection is context, not
            DOM shape, and does not mind. */}
        <li className="topnav-end">
          <SearchButton />
          <AppSwitcherButton />

          <TopNavProfile />
        </li>
      </NavShell>
      {/* A fresh object on every server render of this layout; see
          NavUserRefresh. */}
      <NavUserRefresh revision={{}} />
    </header>
  );
}
