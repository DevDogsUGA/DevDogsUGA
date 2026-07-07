import Image from "next/image";
import Link from "next/link";
import { ListIcon } from "@phosphor-icons/react/ssr";
import { Suspense } from "react";
import devdog from "~/assets/devdog.png";
import AppSwitcherButton from "./AppSwitcherButton";
import NavLinks from "./NavLinks";
import SearchButton from "./SearchButton";
import { TopNavConsole, TopNavMobile, TopNavProfile } from "./TopNavUser";
import UserClusterSkeleton from "./UserClusterSkeleton";

export default function TopNav() {
  return (
    <header className="sticky top-0 z-50 border-b-2 border-mauve-800 bg-mauve-950/90 backdrop-blur">
      <div className="flex h-16 items-center gap-4 px-4 md:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2 lg:gap-2.5">
          <figure className="size-7 shrink-0">
            <Image alt="" src={devdog} />
          </figure>
          <span className="font-display text-lg font-semibold text-white">
            DevDogs
          </span>
        </Link>

        <NavLinks />

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
