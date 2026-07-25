import { PROFILE_ITEMS, visibleConsoleItems } from "~/config/nav";
import ConsoleDropdown from "./ConsoleDropdown";
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
export async function TopNavConsole() {
  const user = await getNavUser();
  if (!user) return null;

  return (
    <ConsoleDropdown
      items={visibleConsoleItems(user.permissions, user.credentialsAccess)}
    />
  );
}

export async function TopNavProfile() {
  const user = await getNavUser();

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
        items={PROFILE_ITEMS}
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

  return (
    <MobileSheet
      consoleItems={
        user
          ? visibleConsoleItems(user.permissions, user.credentialsAccess)
          : []
      }
      profileItems={PROFILE_ITEMS}
      signedIn={user !== null}
    />
  );
}
