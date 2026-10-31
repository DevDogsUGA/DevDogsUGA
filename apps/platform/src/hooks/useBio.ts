"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { normalizeShortText, sanitizeShortTextInput } from "~/lib/shortText";
import { updateBio } from "~/server/actions/profile";
import { validateBio } from "~/lib/validation/profile";

export const normalizeBio = normalizeShortText;

/**
 * `saveBio` does not toast. It returns the action's result: the page-wide save
 * bar awaits it alongside every other dirty field and reports the outcome once.
 */
export function useBio(initialBio: string | null) {
  const initial = initialBio ? normalizeShortText(initialBio) : "";
  const [bio, setBioRaw] = useState(initial);
  const [savedBio, setSavedBio] = useState(initial);

  const mutation = useMutation({
    mutationFn: (value: string) => updateBio(value),
    onSuccess: (result, value) => {
      if (!result.ok) return;
      const saved = result.data ?? value;
      setBioRaw(saved);
      setSavedBio(saved);
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
