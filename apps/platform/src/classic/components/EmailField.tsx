import type { getProfilePageData } from "~/server/loaders/console";
import Input from "~/classic/components/Input";

type ProfileData = Awaited<ReturnType<typeof getProfilePageData>>;

/**
 * The sign-in account. It is read-only and never public (the profile's own
 * switches cover only GitHub, Discord and LinkedIn), so there is nothing to
 * toggle and nothing to unlink.
 */
export default function EmailField({ email }: ProfileData) {
  return (
    <Input
      className="max-w-sm"
      value={email ?? undefined}
      readOnly
      disabled
      type="email"
    />
  );
}
