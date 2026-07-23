"use client";

import { useId } from "react";
import { useProfileIdentity } from "~/hooks/useProfileIdentity";
import type { getProfilePageData } from "~/server/loaders/console";
import Input from "~/components/Input";
import SaveableField from "~/ui/saveable-field";

type ProfileData = Awaited<ReturnType<typeof getProfilePageData>>;

export default function PreferredNameField({ id, profile }: ProfileData) {
  const inputId = useId();
  const { name, setName, nameDirty, saveName, resetName, isNamePending } =
    useProfileIdentity(id, profile.preferredName);

  return (
    <SaveableField
      isDirty={nameDirty}
      isPending={isNamePending}
      onSave={saveName}
      onReset={resetName}
    >
      <Input
        id={inputId}
        className="max-w-sm"
        value={name}
        onChange={(e) => setName(e.target.value)}
        minLength={1}
        maxLength={32}
        name="preferredName"
        type="text"
        required
      />
    </SaveableField>
  );
}
