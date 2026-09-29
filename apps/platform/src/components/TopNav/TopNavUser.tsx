"use client";

import { ListIcon } from "@phosphor-icons/react/ssr";
import { ACCOUNT_ITEMS, PROFILE_ITEMS } from "~/config/nav";
import MobileSheet from "./MobileSheet";
import { useMe } from "./NavUserProvider";
import ProfilePopover from "./ProfilePopover";
import SignInButton from "./SignInButton";
import UserClusterSkeleton from "./UserClusterSkeleton";

/**
 * The per-viewer slice of the navbar. The server renders the loading state
 * (pages read no session, so they can be cached), and `/me` fills it in after
 * hydration; see `NavUserProvider`.
 */
export function TopNavProfile() {
  const me = useMe();

  // These land inside the navbar's right-hand cluster, which is already one
  // <li>, so they render plainly.
  if (me === undefined) return <UserClusterSkeleton />;
  if (me === null) return <SignInButton />;

  return (
    <ProfilePopover
      user={me.user}
      items={ACCOUNT_ITEMS}
      consoleItems={me.consoleItems}
    />
  );
}

export function TopNavMobile() {
  const me = useMe();

  if (me === undefined) {
    return (
      <span
        aria-hidden
        className="flex size-9 items-center justify-center text-mauve-300 md:hidden"
      >
        <ListIcon className="size-5" />
      </span>
    );
  }

  return (
    <MobileSheet
      consoleItems={me?.consoleItems ?? []}
      profileItems={PROFILE_ITEMS}
      signedIn={me !== null}
    />
  );
}
