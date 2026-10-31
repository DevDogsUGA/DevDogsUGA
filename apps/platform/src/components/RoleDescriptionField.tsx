"use client";

import { useId } from "react";
import { useRoleDescription } from "~/hooks/useRoleDescription";
import SettingsField from "~/ui/settings-field";
import { Textarea } from "~/ui/textarea";
import { PROFILE_LIMITS } from "~/lib/validation/profile";
import type { getProfilePageData } from "~/server/loaders/console";

type ProfileData = Awaited<ReturnType<typeof getProfilePageData>>;

export default function RoleDescriptionField({ profile }: ProfileData) {
  const textareaId = useId();
  const {
    roleDescription,
    setRoleDescription,
    roleDescriptionDirty,
    roleDescriptionError,
    saveRoleDescription,
    resetRoleDescription,
  } = useRoleDescription(profile.roleDescription ?? null);

  return (
    <SettingsField
      id="roleDescription"
      label="Role Description"
      className="max-w-[560px]"
      draft={roleDescription}
      isDirty={roleDescriptionDirty}
      error={roleDescriptionError}
      save={saveRoleDescription}
      reset={resetRoleDescription}
      meta={`${roleDescription.length} / ${PROFILE_LIMITS.roleDescription} characters`}
    >
      <Textarea
        id={textareaId}
        value={roleDescription}
        onChange={(e) => setRoleDescription(e.target.value)}
        aria-invalid={roleDescriptionError ? true : undefined}
        maxLength={PROFILE_LIMITS.roleDescription}
        rows={2}
        name="roleDescription"
        placeholder="Describe what you do in this role…"
      />
    </SettingsField>
  );
}
