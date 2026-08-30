import Image from "next/image";
import Link from "next/link";
import { ListIcon } from "@phosphor-icons/react/ssr";
import { Suspense } from "react";
import devdog from "~/assets/devdog.svg";
import { getDocsProjects } from "~/server/docs/queries";
import AppSwitcherButton from "./AppSwitcherButton";
import NavLinks, { NavLinksFallback } from "./NavLinks";
import NavShell from "./NavShell";
import SearchButton from "./SearchButton";
import { TopNavMobile, TopNavProfile } from "./TopNavUser";
import UserClusterSkeleton from "./UserClusterSkeleton";

export default function TopNav() {
  // Parsed from `docs/` at build time, so this is an in-memory read; the whole
  // docs module stays server-side and only the slugs reach the client.
  const docsProjects = getDocsProjects().map(({ slug, name, description }) => ({
    slug,
    name,
    description,
  }));

  return (
    <header className="sticky top-0 z-50 border-b-2 border-mauve-800 bg-mauve-950/90 backdrop-blur">
      {/* One list across the whole bar, not one on each side. Docs and the
          avatar have to sit in the same Radix collection for their panels to
          share a viewport, and a collection is a list. The brand, search, the
          app switcher and the mobile trigger are plain <li>s, which Radix's
          collection ignores. */}
      <NavShell>
        {/* Spaced like the row of links it mostly is, with the two ends
            keeping the wider gaps they had before there was a list: the brand
            sits a full 1rem off the first link, and the right-hand cluster
            keeps its tighter rhythm inside one item. Spacing every child off
            the list would set one number for three groups that never shared
            one. */}
        <li className="mr-3 shrink-0">
          <Link href="/" className="flex items-center gap-2 lg:gap-2.5">
            <figure className="size-7 shrink-0">
              <Image alt="" src={devdog} />
            </figure>
            <span className="font-display text-lg font-semibold text-white">
              DevDogs
            </span>
          </Link>
        </li>

        <Suspense fallback={<NavLinksFallback docsProjects={docsProjects} />}>
          <NavLinks docsProjects={docsProjects} />
        </Suspense>

        {/* One item, four controls. The avatar is a menu and so has to be a
            NavigationMenu.Item, but an <li> inside an <li> is not markup, so
            that item renders as a div here. Radix's collection is context, not
            DOM shape, and does not mind. */}
        <li className="ml-auto flex items-center gap-1.5">
          <SearchButton />
          <AppSwitcherButton />

          <Suspense fallback={<UserClusterSkeleton />}>
            <TopNavProfile />
          </Suspense>

          <Suspense
            fallback={
              <span
                aria-hidden
                className="flex size-9 items-center justify-center text-mauve-300 md:hidden"
              >
                <ListIcon className="size-5" />
              </span>
            }
          >
            <TopNavMobile />
          </Suspense>
        </li>
      </NavShell>
    </header>
  );
}
