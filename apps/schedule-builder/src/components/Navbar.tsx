"use client";

import {
  CalendarDotsIcon,
  CaretDownIcon,
  ChalkboardTeacherIcon,
  SignInIcon,
  SignOutIcon,
} from "@phosphor-icons/react/ssr";
import { DogDaysMark } from "@devdogsuga/og";
import Link from "next/link";
import { TermSelector } from "~/components/TermSelector";
import { Button } from "~/components/ui/Button";
import { UserAvatar } from "~/components/ui/UserAvatar";
import signIn from "~/lib/signIn";
import { supabase } from "~/supabase/client";
import { useSession } from "~/components/providers/SessionProvider";
import NavigationLink from "./NavigationLink";
import * as Dropdown from "@radix-ui/react-dropdown-menu";

export function Navbar() {
  const { user, isLoading } = useSession();

  return (
    <nav className="border-t-primary-strong border-b-edge bg-surface sticky top-0 left-0 z-40 border-t-4 border-b px-4">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3 py-2 sm:gap-6">
          <h1 className="shrink-0">
            <Link
              href="/"
              className="text-foreground flex items-center gap-2 transition-opacity hover:opacity-80"
            >
              <DogDaysMark size={28} color="currentColor" />
              <span className="font-display hidden text-xl leading-none font-semibold tracking-tight min-[480px]:block">
                DogDays
              </span>
            </Link>
          </h1>

          <TermSelector />
        </div>

        <ul className="grid auto-cols-fr grid-flow-col">
          <NavigationLink href="/courses">
            <ChalkboardTeacherIcon weight="duotone" className="text-2xl" />
            <span className="text-xs leading-none font-medium tracking-[.0125em]">
              Courses
            </span>
          </NavigationLink>

          <NavigationLink href="/plans">
            <CalendarDotsIcon weight="duotone" className="text-2xl" />
            <span className="text-xs leading-none font-medium tracking-[.0125em]">
              Plans
            </span>
          </NavigationLink>

          {isLoading ? (
            <li className="col-span-2 flex items-center justify-center pl-3">
              <div className="bg-surface-muted h-8 w-20 animate-pulse rounded-sm" />
            </li>
          ) : user ? (
            <li className="contents">
              <Dropdown.Root>
                <Dropdown.Trigger className="hover:bg-primary-soft flex flex-col items-center gap-0.75 px-3 py-2 text-2xl transition-colors">
                  <UserAvatar user={user} />
                  <span className="flex items-center gap-[1ch] text-xs leading-none font-medium tracking-[.0125em]">
                    Profile{" "}
                    <CaretDownIcon weight="bold" className="text-[0.5rem]" />
                  </span>
                </Dropdown.Trigger>
                <Dropdown.Portal>
                  <Dropdown.Content
                    className="border-edge-strong bg-surface z-50 flex min-w-40 flex-col rounded-md border py-1.5 text-sm shadow-xl"
                    align="end"
                    sideOffset={-4}
                    alignOffset={4}
                  >
                    <button
                      className="text-accent hover:bg-primary-soft flex items-center gap-3 py-1 pr-6 pl-3 transition-colors"
                      type="button"
                      onClick={() => void supabase.auth.signOut()}
                    >
                      <SignOutIcon />
                      Sign Out
                    </button>
                  </Dropdown.Content>
                </Dropdown.Portal>
              </Dropdown.Root>
            </li>
          ) : (
            <li className="col-span-2 flex items-center justify-center pl-3">
              <Button size="sm" className="w-full" onClick={signIn}>
                Get Started <SignInIcon weight="bold" />
              </Button>
            </li>
          )}
        </ul>
      </div>
    </nav>
  );
}
