"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "~/lib/toast";
import {
  publicProfileToastLabel,
  type PublicProfileField,
  type PublicProfileSwitches,
} from "~/lib/publicProfileFields";
import { setPublicProfileField } from "~/server/actions/publicProfile";

/**
 * The public-profile switches, saved one at a time through
 * `setPublicProfileField` (which revalidates the directory and profile page).
 * Optimistic, rolling back with a toast when the write is refused, like
 * `useAccountVisibility` does for the connected-account toggles.
 */
export function usePublicProfileSwitches(initial: PublicProfileSwitches) {
  const [switches, setSwitches] = useState(initial);

  const mutation = useMutation({
    mutationFn: async ({
      field,
      value,
    }: {
      field: PublicProfileField;
      value: boolean;
    }) => {
      const outcome = await setPublicProfileField(field, value);
      if (outcome.status === "blocked") {
        throw new Error("Your profile is locked, so it cannot be changed.");
      }
      if (outcome.status === "rate_limited") {
        throw new Error("Too many changes. Wait a few minutes and try again.");
      }
      return { field, value };
    },
    onMutate: ({ field, value }) => {
      const previous = switches[field];
      setSwitches((current) => ({ ...current, [field]: value }));
      return { field, previous };
    },
    onSuccess: ({ field, value }) => {
      toast.success(
        field === "publicProfile"
          ? `Public profile turned ${value ? "on" : "off"}`
          : `${publicProfileToastLabel(field)} ${value ? "shown" : "hidden"} on public profile`,
      );
    },
    onError: (error, _vars, context) => {
      if (context) {
        setSwitches((current) => ({
          ...current,
          [context.field]: context.previous,
        }));
      }
      toast.error(
        error instanceof Error ? error.message : "Failed to update visibility",
      );
    },
  });

  return {
    switches,
    toggle: (field: PublicProfileField) =>
      mutation.mutate({ field, value: !switches[field] }),
    isPending: (field: PublicProfileField) =>
      mutation.isPending && mutation.variables?.field === field,
  };
}
