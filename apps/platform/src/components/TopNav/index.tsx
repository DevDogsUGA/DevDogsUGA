import Image from "next/image";
import Link from "next/link";
import { ListIcon } from "@phosphor-icons/react/ssr";
import { Suspense } from "react";
import devdog from "~/assets/devdog.png";
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
          share a viewport, and a collection is a list. The items that are not
          menus — the brand, search, the app switcher, the mobile trigger —
          are plain <li>s, which Radix's collection ignores. */}
      <NavShell>
        <li className="shrink-0">
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

        <li className="ml-auto flex items-center gap-1.5">
          <SearchButton />
          <AppSwitcherButton />
        </li>

        <Suspense fallback={<UserClusterSkeleton />}>
          <TopNavProfile />
        </Suspense>

        <li className="flex items-center">
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
