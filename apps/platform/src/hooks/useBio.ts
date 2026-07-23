"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { normalizeShortText, sanitizeShortTextInput } from "~/lib/shortText";
import { toast } from "~/lib/toast";
import { createClient } from "~/supabase/client";

export const normalizeBio = normalizeShortText;

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
      toast.success("Bio saved");
    },
    onError: () => {
      toast.error("Failed to save bio");
    },
  });

  function setBio(raw: string) {
    setBioRaw(sanitizeShortTextInput(raw));
  }

  function saveBio() {
    mutation.mutate(normalizeShortText(bio));
  }

  return {
    bio,
    setBio,
    bioDirty: bio !== savedBio,
    saveBio,
    resetBio: () => setBioRaw(savedBio),
    isBioPending: mutation.isPending,
  };
}
