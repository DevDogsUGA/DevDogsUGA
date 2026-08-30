"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useUnsavedChangesWarning } from "~/hooks/useUnsavedChangesWarning";
import { shouldInterceptNavigation } from "~/lib/navigationGuard";
import { toast } from "~/lib/toast";

/**
 * One save button for a whole settings page.
 *
 * Replaces the per-field `InlineSave` row, where each field owned a save
 * button, a reset, a toast, an unsaved-changes warning and its own Ctrl/Cmd+S
 * handler: changing four things on the account page meant four Saves and four
 * toasts. Now each field registers `isDirty`, an `error` and the two callbacks,
 * and the page grows one bar that commits all of them at once.
 *
 * Fields still own their state and their write. `saveAll` fans out to each
 * dirty field's `save` in parallel rather than posting one combined payload,
 * because the writes differ: some go straight to PostgREST, some through a
 * server action. That makes failure partial, so two things guard it:
 *
 *   1. Nothing saves while any dirty field reports an `error`. Those come from
 *      ~/lib/validation/profile, the same module the server actions validate
 *      with, so the client refuses exactly what the server would.
 *   2. If a write fails anyway, the toast names the fields that did not land
 *      and the rest stay dirty, so the bar is there to retry them.
 */

export interface SettingsFieldRegistration {
  /** Stable identity for this field within the form. */
  id: string;
  /** Human name. Used when a save fails, so it has to read well in a sentence. */
  label: string;
  isDirty: boolean;
  /**
   * Non-null blocks the save. Fields derive it from ~/lib/validation/profile
   * and render it under themselves once blurred. See `useBlurredError`.
   */
  error: string | null;
  /** Must reject on failure; `saveAll` reads the rejection to name the field. */
  save: () => Promise<unknown>;
  /** Returns the field to its last-saved value. */
  reset: () => void;
}

interface FieldSummary {
  label: string;
  isDirty: boolean;
  error: string | null;
}

interface FieldHandlers {
  save: () => Promise<unknown>;
  reset: () => void;
}

interface SettingsFormContextValue {
  setSummary: (id: string, summary: FieldSummary) => void;
  unregister: (id: string) => void;
  handlers: React.RefObject<Map<string, FieldHandlers>>;
  /**
   * Bumped when someone tries to save an invalid form. Fields watch it so a
   * field the member never focused still shows why the save did not go.
   */
  errorsRevealed: number;
  isSaving: boolean;
  dirtyCount: number;
  /** Labels of dirty fields that are currently blocking the save. */
  invalidLabels: string[];
  saveAll: () => void;
  resetAll: () => void;
  /**
   * Bumped each time a link click was swallowed to protect unsaved changes.
   * The bar watches it and draws attention to itself. An unanswered click
   * reads as the page having ignored it.
   */
  blockedAt: number;
}

const SettingsFormContext = createContext<SettingsFormContextValue | null>(
  null,
);

const listFormatter = new Intl.ListFormat("en", {
  style: "long",
  type: "conjunction",
});

export function SettingsFormProvider({ children }: { children: ReactNode }) {
  const [summaries, setSummaries] = useState<Record<string, FieldSummary>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [errorsRevealed, setErrorsRevealed] = useState(0);
  const handlers = useRef(new Map<string, FieldHandlers>());

  const setSummary = useCallback((id: string, summary: FieldSummary) => {
    setSummaries((prev) => {
      const existing = prev[id];
      // Fields re-register on every render; only a real change may re-render
      // the bar, or this loops.
      if (
        existing?.label === summary.label &&
        existing?.isDirty === summary.isDirty &&
        existing?.error === summary.error
      ) {
        return prev;
      }
      return { ...prev, [id]: summary };
    });
  }, []);

  const unregister = useCallback((id: string) => {
    handlers.current.delete(id);
    setSummaries((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const dirty = useMemo(
    () => Object.entries(summaries).filter(([, s]) => s.isDirty),
    [summaries],
  );

  // Only a DIRTY field's error blocks the save. A clean field can carry an
  // error when data saved under an older rule no longer passes the current
  // one, and refusing to save the rest of the page over that would strand the
  // member with no way forward.
  const invalid = useMemo(() => dirty.filter(([, s]) => s.error), [dirty]);
  const invalidLabels = useMemo(
    () => invalid.map(([, s]) => s.label),
    [invalid],
  );

  const dirtyCount = dirty.length;
  const isDirty = dirtyCount > 0;
  useUnsavedChangesWarning(isDirty);

  // Client-side navigation away from unsaved work.
  //
  // `useUnsavedChangesWarning` above only fires when the document itself is
  // going away. A `<Link>` click never unloads anything: the router swaps the
  // tree, this page unmounts, and the edits vanish with no prompt. This catches
  // the click on the way down, before Link's own handler sees it, and makes the
  // bar ask for attention instead. Only while dirty, so a clean form never
  // makes a link feel broken. See ~/lib/navigationGuard for which clicks are
  // eligible.
  const [blockedAt, setBlockedAt] = useState(0);
  useEffect(() => {
    if (!isDirty) return;

    function handleClick(event: MouseEvent) {
      if (event.defaultPrevented) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;

      const intercept = shouldInterceptNavigation(
        {
          href: anchor.href,
          target: anchor.getAttribute("target"),
          hasDownload: anchor.hasAttribute("download"),
          button: event.button,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          shiftKey: event.shiftKey,
          altKey: event.altKey,
        },
        window.location.href,
      );
      if (!intercept) return;

      // preventDefault alone is enough, and deliberately not stopPropagation.
      // Link's own click handler ends with `if (e.defaultPrevented) return`
      // before it navigates (see next/dist/client/app-dir/link.js), and this
      // listener is on the document in the capture phase, so it has already run
      // by the time React builds the synthetic event. Killing propagation would
      // also silence every unrelated handler on the way down, such as a menu
      // closing itself when its own link was clicked.
      event.preventDefault();
      setBlockedAt((n) => n + 1);
    }

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [isDirty]);

  const saveAll = useCallback(() => {
    if (dirty.length === 0 || isSaving) return;
    if (invalid.length > 0) {
      setErrorsRevealed((n) => n + 1);
      return;
    }

    const targets = dirty.map(([id, summary]) => ({ id, summary }));
    setIsSaving(true);

    void Promise.allSettled(
      targets.map(({ id }) => {
        const handler = handlers.current.get(id);
        // Wrapped because `save()` is a field's own closure and is only
        // promised to return a promise. A synchronous throw from one field
        // would escape this `map` before `allSettled` was constructed, leaving
        // `isSaving` stuck true. Every input on the page reads that flag to
        // disable itself, so one bad field would freeze the whole form with no
        // error and no way back except a reload.
        try {
          return handler ? handler.save() : Promise.resolve();
        } catch (cause) {
          return Promise.reject(
            cause instanceof Error ? cause : new Error(String(cause)),
          );
        }
      }),
    ).then((results) => {
      setIsSaving(false);

      const failed = targets
        .filter((_, i) => results[i]?.status === "rejected")
        .map(({ summary }) => summary.label);

      if (failed.length === 0) {
        toast.success(
          targets.length === 1
            ? `${targets[0]!.summary.label} saved`
            : "Changes saved",
        );
        return;
      }

      const names = listFormatter.format(failed);
      toast.error(
        failed.length === targets.length
          ? `Couldn't save ${names}.`
          : `Couldn't save ${names}. Your other changes were saved.`,
      );
    });
  }, [dirty, invalid, isSaving]);

  const resetAll = useCallback(() => {
    if (isSaving) return;
    for (const [id] of dirty) handlers.current.get(id)?.reset();
  }, [dirty, isSaving]);

  // Page-wide Ctrl/Cmd+S. The per-field version had to scope itself to focus
  // within one field's wrapper; with a single save there is nothing to scope
  // to, so it works anywhere on the page. The ref keeps the listener from
  // being torn down and re-added every time a keystroke changes `dirty`.
  const saveAllRef = useRef(saveAll);
  useEffect(() => {
    saveAllRef.current = saveAll;
  });
  useEffect(() => {
    if (!isDirty) return;
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveAllRef.current();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isDirty]);

  const value = useMemo<SettingsFormContextValue>(
    () => ({
      setSummary,
      unregister,
      handlers,
      errorsRevealed,
      isSaving,
      dirtyCount,
      invalidLabels,
      saveAll,
      resetAll,
      blockedAt,
    }),
    [
      setSummary,
      unregister,
      errorsRevealed,
      isSaving,
      dirtyCount,
      invalidLabels,
      saveAll,
      resetAll,
      blockedAt,
    ],
  );

  return (
    <SettingsFormContext.Provider value={value}>
      {children}
      {/* Floor for the save bar to hover over.

          The bar is fixed to the bottom of the viewport and its card takes
          pointer events, so while it is up it covers the last stretch of the
          page and swallows clicks there. Worst on the control the member is
          using, since the bar appears in response to them using it: type into
          the last field on screen and the answer is a bar landing on top of it.

          Reserved height at the end of the document means there is always
          somewhere to scroll the covered thing to. It costs nothing while the
          bar is down, and it grows rather than snapping, so the page does not
          lurch under the pointer the moment a field goes dirty. */}
      <div
        aria-hidden
        className={`shrink-0 transition-[height] duration-200 ease-out ${
          isDirty ? "h-24" : "h-0"
        }`}
      />
    </SettingsFormContext.Provider>
  );
}

/** The bar's view of the form. */
export function useSettingsForm() {
  const context = useContext(SettingsFormContext);
  if (!context) {
    throw new Error(
      "useSettingsForm must be used inside <SettingsFormProvider>",
    );
  }
  return context;
}

/**
 * Registers a field with the page's save bar.
 *
 * Safe to call with fresh closures every render. The callbacks go into a ref,
 * and only the summary, which is compared by value, can re-render the bar.
 */
export function useSettingsField({
  id,
  label,
  isDirty,
  error,
  save,
  reset,
}: SettingsFieldRegistration) {
  const context = useContext(SettingsFormContext);
  if (!context) {
    throw new Error(
      "useSettingsField must be used inside <SettingsFormProvider>",
    );
  }
  const { setSummary, unregister, handlers, isSaving, errorsRevealed } =
    context;

  // No dep array: the latest callbacks, every commit.
  useEffect(() => {
    handlers.current.set(id, { save, reset });
  });

  useEffect(() => {
    setSummary(id, { label, isDirty, error });
  }, [setSummary, id, label, isDirty, error]);

  // Separate from the effect above so a changing summary does not briefly
  // unregister the field.
  useEffect(() => () => unregister(id), [unregister, id]);

  return { isSaving, errorsRevealed };
}

/**
 * Holds a field's error back until the member has left the field, so "Enter a
 * preferred name." does not appear on the first keystroke of clearing it. After
 * one blur the field reports live, which is what people expect while fixing the
 * thing they were just told about.
 *
 * `errorsRevealed` overrides that: a refused save has to explain itself even
 * for fields nobody touched.
 */
export function useBlurredError(error: string | null) {
  const { errorsRevealed } = useSettingsForm();
  const [blurred, setBlurred] = useState(false);
  const [revealedAt, setRevealedAt] = useState(errorsRevealed);

  if (revealedAt !== errorsRevealed) {
    setRevealedAt(errorsRevealed);
    setBlurred(true);
  }

  const onBlur = useCallback((e: React.FocusEvent<HTMLElement>) => {
    // Ignore focus moving between children of the same field (the pronoun
    // combobox, the two graduation selects).
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setBlurred(true);
  }, []);

  return { error: blurred ? error : null, onBlur };
}

/** The message itself. `role="alert"` because it arrives after the interaction. */
export function FieldError({ error }: { error: string | null }) {
  return (
    <div
      className={`grid transition-[grid-template-rows] duration-200 ease-in-out ${
        error ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
      }`}
    >
      <div className="overflow-hidden">
        <p role="alert" className="pt-2 text-xs leading-tight text-rose-400">
          {error}
        </p>
      </div>
    </div>
  );
}
