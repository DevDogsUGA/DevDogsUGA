"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { createClient } from "~/supabase/client";
import { toast } from "~/lib/toast";

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
      setSavedName(preferredName);
      toast.success("Profile saved");
    },
    onError: () => {
      toast.error("Failed to save profile");
    },
  });

  return {
    name,
    setName,
    nameDirty: name !== savedName,
    saveName: () => nameMutation.mutateAsync(name),
    resetName: () => setName(savedName),
    isNamePending: nameMutation.isPending,
  };
}
