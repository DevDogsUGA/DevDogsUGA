"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { normalizeShortText, sanitizeShortTextInput } from "~/lib/shortText";
import { toast } from "~/lib/toast";
import { createClient } from "~/supabase/client";

export const normalizeRoleDescription = normalizeShortText;

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
      toast.success("Role description saved");
    },
    onError: () => {
      toast.error("Failed to save role description");
    },
  });

  function setRoleDescription(raw: string) {
    setRoleDescriptionRaw(sanitizeShortTextInput(raw));
  }

  function saveRoleDescription() {
    mutation.mutate(normalizeShortText(roleDescription));
  }

  return {
    roleDescription,
    setRoleDescription,
    roleDescriptionDirty: roleDescription !== savedRoleDescription,
    saveRoleDescription,
    resetRoleDescription: () => setRoleDescriptionRaw(savedRoleDescription),
    isRoleDescriptionPending: mutation.isPending,
  };
}
