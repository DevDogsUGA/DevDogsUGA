"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { normalizeShortText, sanitizeShortTextInput } from "~/lib/shortText";
import { createClient } from "~/supabase/client";
import { validateBio } from "~/lib/validation/profile";

export const normalizeBio = normalizeShortText;

/**
 * `saveBio` neither catches nor toasts: the page-wide save bar awaits it
 * alongside every other dirty field and reports the outcome once.
 */
export function useBio(userId: string, initialBio: string | null) {
  const initial = initialBio ? normalizeShortText(initialBio) : "";
  const [bio, setBioRaw] = useState(initial);
  const [savedBio, setSavedBio] = useState(initial);

  const mutation = useMutation({
    mutationFn: async (value: string) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("profile")
        .update({ bio: value || null })
        .eq("userId", userId);
      if (error) throw error;
      return value;
    },
    onSuccess: (value) => {
      setBioRaw(value);
      setSavedBio(value);
    },
  });

  function setBio(raw: string) {
    setBioRaw(sanitizeShortTextInput(raw));
  }

  return {
    bio,
    setBio,
    bioDirty: bio !== savedBio,
    bioError: validateBio(bio),
    saveBio: () => mutation.mutateAsync(normalizeShortText(bio)),
    resetBio: () => setBioRaw(savedBio),
    isBioPending: mutation.isPending,
  };
}
