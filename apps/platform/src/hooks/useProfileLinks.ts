"use client";

import { useMutation } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import type { ActionResult } from "~/lib/actionResult";
import { updateProfileLinks } from "~/server/actions/profile";
import type { profileLinks } from "~/server/db/schema";

type ProfileLink = typeof profileLinks.$inferSelect;

/**
 * A link as it exists on screen, which is not necessarily a link that exists
 * on the server. `isNew` links have a local `new:n` id and become rows on save.
 */
export interface DraftLink {
  id: string;
  url: string;
  title: string | null;
  sortOrder: number;
  isNew: boolean;
}

export interface UseProfileLinksReturn {
  links: DraftLink[];
  /**
   * Whether a given list differs from what the server holds.
   *
   * It takes the list rather than reading the draft because the list on screen
   * is not always the draft: a URL typed into the add-link box shows as a
   * preview card and is committed by the page-wide save, without the member
   * pressing Add first. The component folds that pending input into the draft
   * and passes the result here, to `validateLinks`, and to `save`, so the
   * preview card, the dirty count and the write all describe one list.
   */
  isDirtyFor: (links: DraftLink[]) => boolean;
  /** Returns the new link's local id, so the caller can skip its entrance animation. */
  addLink: (url: string, title: string | null, sortOrder: number) => string;
  removeLink: (id: string) => void;
  updateLink: (id: string, url: string, title: string | null) => void;
  reorderLink: (id: string, newSortOrder: number) => void;
  /** One transaction on the server: the saved list on success, nothing written on failure. */
  save: (links: DraftLink[]) => Promise<ActionResult<ProfileLink[]>>;
  reset: () => void;
  isSaving: boolean;
}

function toDraft(links: ProfileLink[]): DraftLink[] {
  return links.map((l) => ({
    id: l.id,
    url: l.url,
    title: l.title,
    sortOrder: l.sortOrder ?? 0,
    isNew: false,
  }));
}

const bySortOrder = (a: { sortOrder: number }, b: { sortOrder: number }) =>
  a.sortOrder - b.sortOrder;

/**
 * Links, staged.
 *
 * Adding, editing, deleting and reordering each used to fire their own write
 * the moment they happened, which made the links list the one part of the
 * account page with no save button. It just kept saving. Now every operation
 * edits a local draft and nothing reaches the server until the page's save bar
 * commits, so links behave like the rest of the form and a mis-drag is undone
 * with Reset rather than with a second mis-drag.
 */
export function useProfileLinks(
  initialLinks: ProfileLink[],
): UseProfileLinksReturn {
  const [committed, setCommitted] = useState(initialLinks);
  const [draft, setDraft] = useState(() => toDraft(initialLinks));
  const [nextTempId, setNextTempId] = useState(0);

  const isDirtyFor = useCallback(
    (list: DraftLink[]) => {
      if (list.length !== committed.length) return true;
      const byId = new Map(committed.map((c) => [c.id, c]));
      return list.some((d) => {
        // A staged link has no committed counterpart, so `c?.url` is undefined
        // and the first comparison already reports it as a change.
        const c = byId.get(d.id);
        return (
          c?.url !== d.url ||
          c?.title !== d.title ||
          (c?.sortOrder ?? 0) !== d.sortOrder
        );
      });
    },
    [committed],
  );

  const mutation = useMutation({
    mutationFn: (draftNow: DraftLink[]) => {
      const survivors = new Map(committed.map((c) => [c.id, c]));
      return updateProfileLinks({
        remove: committed
          .filter((c) => !draftNow.some((d) => d.id === c.id))
          .map((c) => c.id),
        update: draftNow
          .filter((d) => {
            const c = survivors.get(d.id);
            return (
              !d.isNew &&
              c &&
              (c.url !== d.url ||
                c.title !== d.title ||
                (c.sortOrder ?? 0) !== d.sortOrder)
            );
          })
          .map(({ id, url, title, sortOrder }) => ({
            id,
            url,
            title,
            sortOrder,
          })),
        add: draftNow
          .filter((d) => d.isNew)
          .map(({ url, title, sortOrder }) => ({ url, title, sortOrder })),
      });
    },
    // The save is one transaction, so a refusal wrote nothing and the draft
    // stays as it was, for a retry.
    onSuccess: (result) => {
      if (!result.ok || !result.data) return;
      setCommitted(result.data);
      setDraft(toDraft(result.data));
    },
  });

  const addLink = useCallback(
    (url: string, title: string | null, sortOrder: number) => {
      const id = `new:${nextTempId}`;
      setDraft((prev) =>
        [...prev, { id, url, title, sortOrder, isNew: true }].sort(bySortOrder),
      );
      setNextTempId((n) => n + 1);
      return id;
    },
    [nextTempId],
  );

  const removeLink = useCallback((id: string) => {
    setDraft((prev) => prev.filter((l) => l.id !== id));
  }, []);

  const updateLink = useCallback(
    (id: string, url: string, title: string | null) => {
      setDraft((prev) =>
        prev.map((l) => (l.id === id ? { ...l, url, title } : l)),
      );
    },
    [],
  );

  const reorderLink = useCallback((id: string, newSortOrder: number) => {
    setDraft((prev) =>
      prev
        .map((l) => (l.id === id ? { ...l, sortOrder: newSortOrder } : l))
        .sort(bySortOrder),
    );
  }, []);

  const reset = useCallback(() => setDraft(toDraft(committed)), [committed]);

  return {
    links: draft,
    isDirtyFor,
    addLink,
    removeLink,
    updateLink,
    reorderLink,
    save: (links: DraftLink[]) => mutation.mutateAsync(links),
    reset,
    isSaving: mutation.isPending,
  };
}
