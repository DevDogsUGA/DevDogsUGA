"use client";

import { useId } from "react";
import { useProfileIdentity } from "~/hooks/useProfileIdentity";
import type { getProfilePageData } from "~/server/loaders/console";
import Input from "~/components/Input";
import SettingsField from "~/ui/settings-field";
import { PROFILE_LIMITS } from "~/lib/validation/profile";

type ProfileData = Awaited<ReturnType<typeof getProfilePageData>>;

export default function PreferredNameField({ id, profile }: ProfileData) {
  const inputId = useId();
  const {
    name,
    setName,
    nameDirty,
    nameError,
    saveName,
    resetName,
  } = useProfileIdentity(id, profile.preferredName);

  return (
    <SettingsField
      id="preferredName"
      label="Preferred Name"
      isDirty={nameDirty}
      error={nameError}
      save={saveName}
      reset={resetName}
    >
      <Input
        id={inputId}
        className="max-w-sm"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={PROFILE_LIMITS.preferredName}
        aria-invalid={nameError ? true : undefined}
        name="preferredName"
        type="text"
        required
      />
    </SettingsField>
  );
}
