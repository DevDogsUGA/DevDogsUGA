"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import {
  DOCS_VARIANTS_ROOT_ID,
  type OfferedVariants,
} from "~/lib/docsVariants";
import { setDocsVariant, useDocsVariant } from "./store";

/**
 * Keeps the wrapper's `data-<group>` attributes on the reader's choice after
 * the inline script's first pass: when they pick a tab, when the switcher
 * changes, and on client navigation to another project, where the inline
 * script does not run again and the offered values may differ.
 */
export default function Controller({ offered }: { offered: OfferedVariants }) {
  const os = useDocsVariant("os", offered.os ?? []);
  const supabase = useDocsVariant("supabase", offered.supabase ?? []);
  const pathname = usePathname();

  useEffect(() => {
    const root = document.getElementById(DOCS_VARIANTS_ROOT_ID);
    if (!root) return;
    const values: Record<string, string | null> = { os, supabase };
    for (const [group, value] of Object.entries(values)) {
      if (value !== null) root.setAttribute(`data-${group}`, value);
    }
    // The visible state is CSS; this keeps assistive tech in step with it.
    for (const tab of root.querySelectorAll<HTMLElement>(".docs-tab")) {
      const group = tab.dataset.group ?? "";
      tab.setAttribute(
        "aria-selected",
        String(values[group] === tab.dataset.value),
      );
    }
  }, [os, supabase, pathname]);

  useEffect(() => {
    const root = document.getElementById(DOCS_VARIANTS_ROOT_ID);
    if (!root) return;
    function onClick(event: MouseEvent) {
      const tab = (event.target as Element).closest<HTMLElement>(".docs-tab");
      const group = tab?.dataset.group;
      const value = tab?.dataset.value;
      if (group && value) setDocsVariant(group, value);
    }
    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
  }, []);

  return null;
}
