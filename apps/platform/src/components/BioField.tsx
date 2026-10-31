"use client";

import { useId } from "react";
import { useBio } from "~/hooks/useBio";
import type { getProfilePageData } from "~/server/loaders/console";
import SettingsField from "~/ui/settings-field";
import { Textarea } from "~/ui/textarea";
import { PROFILE_LIMITS } from "~/lib/validation/profile";

type ProfileData = Awaited<ReturnType<typeof getProfilePageData>>;

export default function BioField({ profile }: ProfileData) {
  const textareaId = useId();
  const { bio, setBio, bioDirty, bioError, saveBio, resetBio } = useBio(
    profile.bio ?? null,
  );

  const lineCount = bio.split("\n").length;

  return (
    <SettingsField
      id="bio"
      label="Bio"
      className="max-w-[720px]"
      draft={bio}
      isDirty={bioDirty}
      error={bioError}
      save={saveBio}
      reset={resetBio}
      meta={`${bio.length} / ${PROFILE_LIMITS.shortText} characters`}
      secondaryMeta={lineCount > 1 ? `${lineCount} / 3 lines` : undefined}
    >
      <Textarea
        id={textareaId}
        value={bio}
        onChange={(e) => setBio(e.target.value)}
        aria-invalid={bioError ? true : undefined}
        rows={3}
        name="bio"
        placeholder="Tell people a bit about yourself…"
      />
    </SettingsField>
  );
}
