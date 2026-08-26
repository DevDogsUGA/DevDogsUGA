"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { normalizeShortText, sanitizeShortTextInput } from "~/lib/shortText";
import { createClient } from "~/supabase/client";
import { validateRoleDescription } from "~/lib/validation/profile";

export const normalizeRoleDescription = normalizeShortText;

/**
 * `saveRoleDescription` neither catches nor toasts: the page-wide save bar
 * awaits it alongside every other dirty field and reports the outcome once.
 */
export function useRoleDescription(
  userId: string,
  initialRoleDescription: string | null,
) {
  const initial = initialRoleDescription
    ? normalizeShortText(initialRoleDescription)
    : "";
  const [roleDescription, setRoleDescriptionRaw] = useState(initial);
  const [savedRoleDescription, setSavedRoleDescription] = useState(initial);

  const mutation = useMutation({
    mutationFn: async (value: string) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("profile")
        .update({ roleDescription: value || null })
        .eq("userId", userId);
      if (error) throw error;
      return value;
    },
    onSuccess: (value) => {
      setRoleDescriptionRaw(value);
      setSavedRoleDescription(value);
    },
  });

  function setRoleDescription(raw: string) {
    setRoleDescriptionRaw(sanitizeShortTextInput(raw));
  }

  return {
    roleDescription,
    setRoleDescription,
    roleDescriptionDirty: roleDescription !== savedRoleDescription,
    roleDescriptionError: validateRoleDescription(roleDescription),
    saveRoleDescription: () =>
      mutation.mutateAsync(normalizeShortText(roleDescription)),
    resetRoleDescription: () => setRoleDescriptionRaw(savedRoleDescription),
    isRoleDescriptionPending: mutation.isPending,
  };
}
