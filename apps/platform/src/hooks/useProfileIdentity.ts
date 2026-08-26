"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { createClient } from "~/supabase/client";
import { validatePreferredName } from "~/lib/validation/profile";

/**
 * `saveName` deliberately does not catch, and does not toast. The account
 * page's save bar awaits every dirty field at once and needs the rejection to
 * know which ones failed — see ~/ui/settings-form.
 */
export function useProfileIdentity(userId: string, initialName: string) {
  const [name, setName] = useState(initialName);
  const [savedName, setSavedName] = useState(initialName);

  const nameMutation = useMutation({
    mutationFn: async (preferredName: string) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("profile")
        .update({ preferredName })
        .eq("userId", userId);

      if (error) throw error;
      return preferredName;
    },
    onSuccess: (preferredName) => {
      setName(preferredName);
      setSavedName(preferredName);
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
    isNamePending: nameMutation.isPending,
  };
}
