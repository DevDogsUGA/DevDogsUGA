"use client";

import { useMemo, useSyncExternalStore } from "react";

/**
 * Which steps of a docs course (a `steps: true` folder) the reader has
 * finished. Kept in this browser only, like the docs variant choices: one
 * JSON array of `<project>/<path>` keys.
 */
const PROGRESS_KEY = "docs:progress";

/** Fired on this tab after a write; `storage` only reaches other tabs. */
const CHANGE_EVENT = "docs-progress-change";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function readRaw(): string {
  try {
    return localStorage.getItem(PROGRESS_KEY) ?? "";
  } catch {
    return "";
  }
}

function parse(raw: string | null): Set<string> {
  if (!raw) return new Set();
  try {
    const parsed: unknown = JSON.parse(raw);
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((key): key is string => typeof key === "string")
        : [],
    );
  } catch {
    return new Set();
  }
}

/** The key a step is stored under. */
export function stepKey(project: string, path: string): string {
  return `${project}/${path}`;
}

export function setStepDone(key: string, done: boolean): void {
  const keys = parse(readRaw());
  if (done) keys.add(key);
  else keys.delete(key);
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify([...keys]));
  } catch {
    // Storage disabled: nothing to remember it in.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Marks several steps done at once: what a finished VS Code review reports. */
export function markStepsDone(keys: readonly string[]): void {
  if (keys.length === 0) return;
  const done = parse(readRaw());
  keys.forEach((key) => done.add(key));
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify([...done]));
  } catch {
    // Storage disabled: nothing to remember it in.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/**
 * Every finished step's key. Empty on the server and until hydration, which
 * the server cannot know better than: nothing shows as done until then.
 */
export function useDoneSteps(): ReadonlySet<string> {
  const raw = useSyncExternalStore(subscribe, readRaw, () => null);
  return useMemo(() => parse(raw), [raw]);
}
