"use client";

import { useSyncExternalStore } from "react";
import {
  DOCS_VARIANTS_KEY,
  guessOs,
  parsePrefs,
  resolveVariant,
} from "~/lib/docsVariants";

/**
 * Fired on this tab after a write. The `storage` event only reaches OTHER
 * tabs, so without this the switcher and the page it sits beside would each
 * keep the value they last read.
 */
const CHANGE_EVENT = "docs-variants-change";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/**
 * The stored JSON, or "" when nothing is stored. Never null on the client:
 * null is the server snapshot, which is how `useDocsVariant` tells "still
 * hydrating" apart from "the reader has not chosen".
 */
function readRaw(): string {
  try {
    return localStorage.getItem(DOCS_VARIANTS_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setDocsVariant(group: string, value: string): void {
  const prefs = parsePrefs(readRaw());
  prefs[group] = value;
  try {
    localStorage.setItem(DOCS_VARIANTS_KEY, JSON.stringify(prefs));
  } catch {
    // Storage disabled: the choice still applies until the page unloads.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/**
 * The value `group` shows in a project offering `offered`, or null while
 * hydrating (the server cannot know the reader's choice, and guessing would
 * flash the wrong platform in the switcher).
 */
export function useDocsVariant(
  group: string,
  offered: readonly string[],
): string | null {
  const raw = useSyncExternalStore(subscribe, readRaw, () => null);
  if (raw === null) return null;
  const chosen =
    parsePrefs(raw)[group] ??
    (group === "os" ? guessOs(navigator.userAgent) : undefined);
  return resolveVariant(group, chosen, offered);
}
