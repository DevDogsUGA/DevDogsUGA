"use client";

import { useAccountVisibility } from "~/hooks/useAccountVisibility";
import type { getProfilePageData } from "~/server/loaders/console";
import Input from "~/components/Input";
import VisibilityToggle from "~/ui/visibility-toggle";

type ProfileData = Awaited<ReturnType<typeof getProfilePageData>>;

export default function EmailField({ id, email, profile }: ProfileData) {
  const { showEmail, toggle, isPending } = useAccountVisibility(id, {
    showGithub: profile.showGithub,
    showDiscord: profile.showDiscord,
    showEmail: profile.showEmail,
    showLinkedin: profile.showLinkedin,
  });

  return (
    <div className="flex flex-col gap-3">
      <VisibilityToggle
        checked={showEmail}
        pending={isPending("uga")}
        onToggle={() => toggle("uga")}
      />

      <Input
        className="max-w-sm"
        value={email ?? undefined}
        readOnly
        disabled
        type="email"
      />
    </div>
  );
}
