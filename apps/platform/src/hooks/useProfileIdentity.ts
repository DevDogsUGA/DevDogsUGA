"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { updateIdentity } from "~/server/actions/profile";
import { validatePreferredName } from "~/lib/validation/profile";

/**
 * `saveName` does not toast. It returns the action's result, because the
 * account page's save bar awaits every dirty field at once and needs each
 * outcome to know which ones failed. See ~/ui/settings-form.
 */
export function useProfileIdentity(initialName: string) {
  const [name, setName] = useState(initialName);
  const [savedName, setSavedName] = useState(initialName);

  const nameMutation = useMutation({
    mutationFn: (preferredName: string) => updateIdentity({ preferredName }),
    onSuccess: (result) => {
      if (!result.ok) return;
      const saved = result.data?.preferredName ?? name.trim();
      setName(saved);
      setSavedName(saved);
    },
  });

  return {
    name,
    setName,
    nameDirty: name !== savedName,
    nameError: validatePreferredName(name),
    // The trimmed value is the one that gets written, so it is also the one
    // validation ran against.
    saveName: () => nameMutation.mutateAsync(name.trim()),
    resetName: () => setName(savedName),
  };
}
