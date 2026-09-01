import {
  ACCOUNT_ITEMS,
  COMPETITION_ITEMS,
  PROFILE_ITEMS,
  visibleConsoleItems,
} from "~/config/nav";
import MobileSheet from "./MobileSheet";
import { NavUserHydrator } from "./NavUserProvider";
import ProfilePopover from "./ProfilePopover";
import SignInButton from "./SignInButton";
import { getNavUser } from "./data";

/**
 * The dynamic (per-request) slice of the navbar, streamed inside a Suspense
 * boundary so the rest of the page stays statically prerenderable. Console
 * items are filtered server-side; clients only ever receive what they may see.
 */
export async function TopNavProfile() {
  const user = await getNavUser();
  const showCompetitions = process.env.DEPLOY_ENV !== "production";

  // These land inside the navbar's right-hand cluster, which is already one
  // <li>, so they render plainly. The hydrator renders nothing at all.
  if (!user) {
    return (
      <>
        <SignInButton />
        <NavUserHydrator navUser={null} verification={null} />
      </>
    );
  }

  return (
    <>
      <ProfilePopover
        user={{ profile: user.profile, highestRole: user.highestRole }}
        items={ACCOUNT_ITEMS}
        showCompetitions={showCompetitions}
        consoleItems={visibleConsoleItems(
          user.permissions,
          user.credentialsAccess,
        )}
      />
      <NavUserHydrator
        navUser={{ profile: user.profile, highestRole: user.highestRole }}
        verification={user.verification}
      />
    </>
  );
}

export async function TopNavMobile() {
  const user = await getNavUser();
  const profileItems =
    process.env.DEPLOY_ENV === "production"
      ? PROFILE_ITEMS.filter((item) => !COMPETITION_ITEMS.includes(item))
      : PROFILE_ITEMS;

  return (
    <MobileSheet
      consoleItems={
        user
          ? visibleConsoleItems(user.permissions, user.credentialsAccess)
          : []
      }
      profileItems={profileItems}
      signedIn={user !== null}
    />
  );
}
