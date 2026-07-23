"use client";

import { useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import addProfileLink from "~/server/actions/profileLinks";
import { createClient } from "~/supabase/client";
import type { profileLinks } from '~/server/db/schema';
import { toast } from "~/lib/toast";

type ProfileLink = typeof profileLinks.$inferSelect;

interface UseProfileLinksReturn {
  links: ProfileLink[];
  error: string | undefined;
  hasPendingStructural: boolean;
  addLink: (
    url: string,
    title?: string,
    sortOrder?: number,
    onSuccess?: (link: ProfileLink) => void,
    onError?: () => void,
  ) => void;
  removeLink: (id: string) => void;
  updateLink: (id: string, url: string, title?: string) => void;
  reorderLink: (id: string, newSortOrder: number) => void;
  saveStructuralChanges: (currentLinks: ProfileLink[]) => void;
  cancelStructuralChanges: () => void;
  isAddingLink: boolean;
  isUpdatingLink: boolean;
  isSavingStructural: boolean;
}

export function useProfileLinks(
  initialLinks: ProfileLink[],
): UseProfileLinksReturn {
  const [links, setLinks] = useState(initialLinks);
  const [committedLinks, setCommittedLinks] = useState(initialLinks);
  const [error, setError] = useState<string>();

  const hasPendingStructural = useMemo(() => {
    if (committedLinks.length !== links.length) return true;
    const sortedLinks = [...links].sort((a, b) => a.id.localeCompare(b.id));
    const sortedCommitted = [...committedLinks].sort((a, b) =>
      a.id.localeCompare(b.id),
    );
    return sortedLinks.some(
      (l, i) =>
        l.id !== sortedCommitted[i]!.id ||
        l.sortOrder !== sortedCommitted[i]!.sortOrder,
    );
  }, [links, committedLinks]);

  const addMutation = useMutation({
    mutationFn: async ({
      url,
      title,
      sortOrder,
    }: {
      url: string;
      title?: string;
      sortOrder?: number;
    }) => {
      const formData = new FormData();
      formData.append("url", url);
      if (title) formData.append("title", title);
      if (sortOrder !== undefined)
        formData.append("sortOrder", String(sortOrder));
      const result = await addProfileLink(formData);
      if (result.error) throw new Error(result.error);
      return result.link!;
    },
    onSuccess: (link) => {
      const sorted = (prev: ProfileLink[]) =>
        [...prev, link].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      setLinks(sorted);
      setCommittedLinks(sorted);
      setError(undefined);
      toast.success("Link added");
    },
    onError: (err) => {
      const message =
        err instanceof Error ? err.message : "Failed to add link.";
      setError(message);
      toast.error(message);
    },
  });

  const updateLinkMutation = useMutation({
    mutationFn: async ({
      id,
      url,
      title,
    }: {
      id: string;
      url: string;
      title?: string;
    }) => {
      const supabase = createClient();
      const resolvedTitle = title ?? new URL(url).hostname;
      const { error } = await supabase
        .from("profileLinks")
        .update({ url, title: resolvedTitle })
        .eq("id", id);
      if (error) throw error;
      return { id, url, title: resolvedTitle };
    },
    onMutate: ({ id, url, title }) => {
      const previous = links;
      const resolvedTitle = title ?? new URL(url).hostname;
      setLinks((prev) =>
        prev.map((l) =>
          l.id === id ? { ...l, url, title: resolvedTitle } : l,
        ),
      );
      return { previous };
    },
    onSuccess: ({ id, url, title }) => {
      setCommittedLinks((prev) =>
        prev.map((l) => (l.id === id ? { ...l, url, title } : l)),
      );
      toast.success("Link updated");
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) setLinks(context.previous);
      toast.error("Failed to update link");
    },
  });

  const saveStructuralMutation = useMutation({
    mutationFn: async ({
      currentLinks,
      committed,
    }: {
      currentLinks: ProfileLink[];
      committed: ProfileLink[];
    }) => {
      const supabase = createClient();
      const toDelete = committed.filter(
        (cl) => !currentLinks.find((l) => l.id === cl.id),
      );
      const toUpdate = currentLinks.filter((l) => {
        const c = committed.find((cl) => cl.id === l.id);
        return c && c.sortOrder !== l.sortOrder;
      });

      const errors: unknown[] = [];
      await Promise.all([
        ...toDelete.map((l) =>
          supabase
            .from("profileLinks")
            .delete()
            .eq("id", l.id)
            .then(({ error }) => {
              if (error) errors.push(error);
            }),
        ),
        ...toUpdate.map((l) =>
          supabase
            .from("profileLinks")
            .update({ sortOrder: l.sortOrder })
            .eq("id", l.id)
            .then(({ error }) => {
              if (error) errors.push(error);
            }),
        ),
      ]);
      if (errors.length > 0) throw errors[0];
    },
    onSuccess: (_data, { currentLinks }) => {
      setCommittedLinks(currentLinks);
      toast.success("Changes saved");
    },
    onError: () => {
      toast.error("Failed to save changes");
    },
  });

  return {
    links,
    error,
    hasPendingStructural,
    addLink: (
      url: string,
      title?: string,
      sortOrder?: number,
      onSuccess?: (link: ProfileLink) => void,
      onError?: () => void,
    ) => addMutation.mutate({ url, title, sortOrder }, { onSuccess, onError }),
    removeLink: (id: string) =>
      setLinks((prev) => prev.filter((l) => l.id !== id)),
    updateLink: (id: string, url: string, title?: string) =>
      updateLinkMutation.mutate({ id, url, title }),
    reorderLink: (id: string, newSortOrder: number) => {
      setLinks((prev) =>
        prev
          .map((l) => (l.id === id ? { ...l, sortOrder: newSortOrder } : l))
          .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
      );
    },
    saveStructuralChanges: (currentLinks: ProfileLink[]) =>
      saveStructuralMutation.mutate({
        currentLinks,
        committed: committedLinks,
      }),
    cancelStructuralChanges: () => setLinks(committedLinks),
    isAddingLink: addMutation.isPending,
    isUpdatingLink: updateLinkMutation.isPending,
    isSavingStructural: saveStructuralMutation.isPending,
  };
}
