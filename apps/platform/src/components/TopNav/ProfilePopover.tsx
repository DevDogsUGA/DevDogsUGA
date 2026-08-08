"use client";

import * as Dropdown from "@radix-ui/react-dropdown-menu";
import Link from "next/link";
import {
  SealCheckIcon,
  SignOutIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react/ssr";
import Avatar from "~/components/AvatarField/Avatar";
import * as icons from "~/config/icons";
import type { NavItem } from "~/config/nav";
import signOut from "~/server/actions/signOut";
import { useVerification, type NavUserClientData } from "./NavUserProvider";
import VerificationAlert from "./VerificationAlert";

interface Props {
  user: NavUserClientData;
  items: NavItem[];
}

export default function ProfilePopover({ user, items }: Props) {
  const verification = useVerification();

  return (
    <>
      <Dropdown.Root>
        <Dropdown.Trigger asChild>
          <button
            type="button"
            aria-label="Open profile menu"
            className="relative flex shrink-0 items-center rounded-full text-3xl/0 transition-opacity hover:opacity-85"
          >
            <Avatar
              userId={user.profile.userId}
              preferredName={user.profile.preferredName}
            />
            {verification?.isVerified === false && (
              <span className="absolute -right-0.5 -bottom-0.5 flex size-3 items-center justify-center rounded-full bg-mauve-950">
                <WarningCircleIcon className="size-2.5 text-amber-400" />
              </span>
            )}
          </button>
        </Dropdown.Trigger>

        <Dropdown.Portal>
          <Dropdown.Content
            side="bottom"
            align="end"
            sideOffset={10}
            className="z-100 w-3xs max-w-(--radix-popper-available-width) rounded-md border-2 bg-black/80 py-1.5 text-sm font-medium text-white backdrop-blur-xs"
          >
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
              <Dropdown.Item asChild>
                <div className="px-1.5 pb-1.5 focus:outline-none">
                  <VerificationAlert />
                </div>
              </Dropdown.Item>
            )}

            {items.map((item) => {
              const Icon = icons[item.icon];
              return (
                <Dropdown.Item key={item.href} asChild>
                  <Link
                    href={item.href}
                    className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left transition-colors hover:bg-mauve-800 focus:outline-none"
                  >
                    {item.label}
                    <Icon />
                  </Link>
                </Dropdown.Item>
              );
            })}

            <div className="mx-1.5 my-1.5 h-px w-[calc(100%-var(--spacing)*3)] bg-mauve-700" />

            <form action={signOut}>
              <input name="callbackPath" value="/" type="hidden" />
              <Dropdown.Item asChild>
                <button
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-rose-300 transition-colors hover:bg-rose-950 hover:text-rose-50"
                  type="submit"
                >
                  <SignOutIcon /> Sign Out
                </button>
              </Dropdown.Item>
            </form>
          </Dropdown.Content>
        </Dropdown.Portal>
      </Dropdown.Root>
    </>
  );
}
