import Image from "next/image";
import Link from "next/link";
import { ListIcon } from "@phosphor-icons/react/ssr";
import { Suspense } from "react";
import devdog from "~/assets/devdog.png";
import { getDocsProjects } from "~/server/docs/queries";
import AppSwitcherButton from "./AppSwitcherButton";
import NavLinks, { NavLinksFallback } from "./NavLinks";
import SearchButton from "./SearchButton";
import { TopNavConsole, TopNavMobile, TopNavProfile } from "./TopNavUser";
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
      <div className="flex h-16 items-center gap-4 px-4 md:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2 lg:gap-2.5">
          <figure className="size-7 shrink-0">
            {/* `size-7`, and the figure never grows. Without `sizes` Next sizes
                the srcset off the 299px source instead of the 28px box, so the
                logo on every page of the site downloaded at w=384. */}
            <Image alt="" src={devdog} sizes="28px" />
          </figure>
          <span className="font-display text-lg font-semibold text-white">
            DevDogs
          </span>
        </Link>

        <Suspense fallback={<NavLinksFallback docsProjects={docsProjects} />}>
          <NavLinks docsProjects={docsProjects} />
        </Suspense>

        <div className="ml-auto flex items-center gap-1.5">
          <Suspense>
            <TopNavConsole />
          </Suspense>

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
        </div>
      </div>
    </header>
  );
}
