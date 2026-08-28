"use client";

import Image from "next/image";
import Link from "next/link";
import {
  PiCalendarDotsDuotone,
  PiCaretDownBold,
  PiChalkboardTeacherDuotone,
  PiSignInBold,
  PiSignOut,
  PiXBold,
} from "react-icons/pi";
import devdog from "~/assets/devdog.svg";
import { TermSelector } from "~/components/TermSelector";
import { UserAvatar } from "~/components/ui/UserAvatar";
import signIn from "~/lib/signIn";
import { supabase } from "~/supabase/client";
import { useSession } from "~/components/providers/SessionProvider";
import NavigationLink from "./NavigationLink";
import * as Dropdown from "@radix-ui/react-dropdown-menu";

export function Navbar() {
  const { user, isLoading } = useSession();

  return (
    <nav className="sticky top-0 left-0 z-40 border-t-4 border-b border-t-red-800 border-b-zinc-300 bg-white px-4">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between">
        <div className="flex w-2/5 min-w-100 items-center gap-8 py-2">
          <h1 className="flex items-center gap-1.5">
            <Link href="https://devdogs.uga.edu/" target="_blank">
              <figure className="size-8">
                <Image alt="Dev Dog" src={devdog} />
              </figure>
            </Link>
            <PiXBold className="text-base text-zinc-400" />
            <Link
              href="/"
              className="flex flex-col pl-0.5 text-xs leading-none font-bold text-red-950"
            >
              <span>Optimal</span>
              <span>Schedule</span>
              <span>Builder</span>
            </Link>
          </h1>

          <TermSelector />
        </div>

        <ul className="grid auto-cols-fr grid-flow-col">
          <NavigationLink href="/courses">
            <PiChalkboardTeacherDuotone className="text-2xl" />
            <span className="text-xs leading-none font-medium tracking-[.0125em]">
              Courses
            </span>
          </NavigationLink>

          <NavigationLink href="/plans">
            <PiCalendarDotsDuotone className="text-2xl" />
            <span className="text-xs leading-none font-medium tracking-[.0125em]">
              Plans
            </span>
          </NavigationLink>

          {isLoading ? (
            <li className="col-span-2 flex items-center justify-center pl-3">
              <div className="h-8 w-20 animate-pulse rounded-sm bg-neutral-200" />
            </li>
          ) : user ? (
            <li className="contents">
              <Dropdown.Root>
                <Dropdown.Trigger className="flex flex-col items-center gap-0.75 border-0 border-red-950 px-3 py-2 text-2xl transition-colors hover:bg-red-200">
                  <UserAvatar user={user} />
                  <span className="flex items-center gap-[1ch] text-xs leading-none font-medium tracking-[.0125em]">
                    Profile <PiCaretDownBold className="text-[0.5rem]" />
                  </span>
                </Dropdown.Trigger>
                <Dropdown.Portal>
                  <Dropdown.Content
                    className="z-50 flex min-w-40 flex-col rounded-md border border-gray-400 bg-white py-1.5 text-sm shadow-xl"
                    align="end"
                    sideOffset={-4}
                    alignOffset={4}
                  >
                    <button
                      className="flex items-center gap-3 py-1 pr-6 pl-3 text-red-700 transition-colors hover:bg-red-100 hover:text-red-800"
                      type="button"
                      onClick={() => void supabase.auth.signOut()}
                    >
                      <PiSignOut />
                      Sign Out
                    </button>
                  </Dropdown.Content>
                </Dropdown.Portal>
              </Dropdown.Root>
            </li>
          ) : (
            <li className="col-span-2 flex items-center justify-center pl-3">
              <button
                className="flex w-full cursor-default items-center justify-center gap-1.5 rounded-sm border-b-2 border-red-900 bg-red-800 px-3 py-1.5 text-sm font-medium text-white shadow-sm ring-1 ring-red-950 transition-colors hover:bg-red-50 hover:text-red-800 focus:mt-0.5 focus:border-b-0"
                onClick={signIn}
                type="button"
              >
                <span className="contents">
                  Get Started <PiSignInBold />
                </span>
              </button>
            </li>
          )}
        </ul>
      </div>
    </nav>
  );
}
