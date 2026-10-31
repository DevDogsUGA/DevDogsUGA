"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { updateRoleDescription } from "~/server/actions/profile";
import { validateRoleDescription } from "~/lib/validation/profile";
import { acceptRoleDescriptionInput } from "~/lib/roleDescriptionInput";

export const normalizeRoleDescription = (value: string) => value.trim();

/**
 * `saveRoleDescription` does not toast. It returns the action's result: the
 * page-wide save bar awaits it alongside every other dirty field and reports
 * the outcome once.
 */
export function useRoleDescription(initialRoleDescription: string | null) {
  const initial = initialRoleDescription
    ? normalizeRoleDescription(initialRoleDescription)
    : "";
  const [roleDescription, setRoleDescriptionRaw] = useState(initial);
  const [savedRoleDescription, setSavedRoleDescription] = useState(initial);

  const mutation = useMutation({
    mutationFn: (value: string) => updateRoleDescription(value),
    onSuccess: (result, value) => {
      if (!result.ok) return;
      const saved = result.data ?? value;
      setRoleDescriptionRaw(saved);
      setSavedRoleDescription(saved);
    },
  });

  function setRoleDescription(raw: string) {
    setRoleDescriptionRaw((current) =>
      acceptRoleDescriptionInput(current, raw),
    );
  }

  return {
    roleDescription,
    setRoleDescription,
    roleDescriptionDirty: roleDescription !== savedRoleDescription,
    roleDescriptionError: validateRoleDescription(roleDescription),
    saveRoleDescription: () =>
      mutation.mutateAsync(normalizeRoleDescription(roleDescription)),
    resetRoleDescription: () => setRoleDescriptionRaw(savedRoleDescription),
    isRoleDescriptionPending: mutation.isPending,
  };
}
