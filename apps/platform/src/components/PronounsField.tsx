"use client";

import { ComboboxPopover } from "~/ui/combobox";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { XIcon } from "@phosphor-icons/react/ssr";
import InlineSave from "~/ui/inline-save";
import type { getProfilePageData } from "~/server/loaders/console";
import { createClient } from "~/supabase/client";
import { useSaveShortcut } from "~/hooks/useSaveShortcut";
import { useUnsavedChangesWarning } from "~/hooks/useUnsavedChangesWarning";
import { toast } from "~/lib/toast";

type ProfileData = Awaited<ReturnType<typeof getProfilePageData>>;

const PRONOUN_SUGGESTIONS = [
  "he",
  "him",
  "his",
  "she",
  "her",
  "hers",
  "they",
  "them",
  "theirs",
];
const SEPARATOR_KEYS = [" ", "/", "-", ","];

export default function PronounsField({ id, profile }: ProfileData) {
  const [pronouns, setPronouns] = useState<string[]>(profile.pronouns ?? []);
  const [saved, setSaved] = useState<string[]>(profile.pronouns ?? []);
  const [input, setInput] = useState("");
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const uid = useId();
  const inputId = useId();
  const listboxId = `${uid}-listbox`;

  const mutation = useMutation({
    mutationFn: async (values: string[]) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("profile")
        .update({ pronouns: values })
        .eq("userId", id);
      if (error) throw error;
    },
    onSuccess: () => {
      setSaved([...pronouns]);
      toast.success("Pronouns saved");
    },
    onError: () => toast.error("Failed to save pronouns"),
  });

  const dirty = JSON.stringify(pronouns) !== JSON.stringify(saved);
  useUnsavedChangesWarning(dirty);
  const shortcut = useSaveShortcut(
    () => mutation.mutate(pronouns),
    dirty && !mutation.isPending,
  );
  const q = input.toLowerCase().trim();
  const suggestions = PRONOUN_SUGGESTIONS.filter(
    (s) => s.startsWith(q) && !pronouns.includes(s),
  );
  const canAddCustom =
    q.length > 0 &&
    q.length <= 6 &&
    !pronouns.includes(q) &&
    !PRONOUN_SUGGESTIONS.includes(q);
  const allOptions = [...suggestions, ...(canAddCustom ? [q] : [])];
  const showPopover =
    popoverOpen && allOptions.length > 0 && pronouns.length < 4;

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>("[data-active]")
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  function addPronoun(p: string) {
    if (pronouns.length < 4) setPronouns((prev) => [...prev, p]);
    setInput("");
    setActiveIndex(0);
    setPopoverOpen(false);
    inputRef.current?.focus();
  }

  function removeLastPronoun() {
    setPronouns((prev) => prev.slice(0, -1));
  }

  return (
    <div onFocus={shortcut.onFocus} onBlur={shortcut.onBlur}>
      <ComboboxPopover.Root open={showPopover} onOpenChange={setPopoverOpen}>
        <ComboboxPopover.Anchor asChild>
          <span className="group focus-within:shadow-block-sm relative flex max-w-sm cursor-text flex-wrap items-center gap-0.5 rounded-sm border border-mauve-600 bg-mauve-800 p-2 text-sm transition-shadow focus-within:inset-shadow-sm hover:border-mauve-500 hover:inset-shadow-sm">
            {pronouns.map((p) => (
              <span
                key={p}
                className="flex shrink-0 items-center gap-1.5 rounded-full border border-mauve-600 bg-mauve-800 py-0.5 pr-1.5 pl-2 text-sm text-white has-[button:hover]:border-rose-500 has-[button:hover]:bg-rose-500/10 has-[button:hover]:text-rose-300"
              >
                {p}
                <button
                  type="button"
                  onClick={() =>
                    setPronouns((prev) => prev.filter((x) => x !== p))
                  }
                  className="rounded-sm text-mauve-400 hover:text-rose-400"
                  aria-label={`Remove ${p}`}
                >
                  <XIcon />
                </button>
              </span>
            ))}
            {pronouns.length < 4 && (
              <input
                ref={inputRef}
                type="text"
                role="combobox"
                aria-expanded={showPopover}
                aria-haspopup="listbox"
                aria-controls={listboxId}
                aria-autocomplete="list"
                aria-activedescendant={
                  showPopover && allOptions.length > 0
                    ? `${uid}-option-${activeIndex}`
                    : undefined
                }
                id={inputId}
                value={input}
                maxLength={6}
                placeholder={pronouns.length === 0 ? "Add pronouns…" : ""}
                className="min-w-16 flex-1 border-0 bg-transparent p-0 px-1 text-sm text-white placeholder:text-mauve-500 focus:ring-0 focus:outline-none"
                onChange={(e) => {
                  setInput(e.target.value);
                  setActiveIndex(0);
                  setPopoverOpen(true);
                }}
                onFocus={() => {
                  setActiveIndex(0);
                  setPopoverOpen(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setActiveIndex((i) =>
                      allOptions.length ? (i + 1) % allOptions.length : 0,
                    );
                    return;
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setActiveIndex((i) =>
                      allOptions.length
                        ? (i - 1 + allOptions.length) % allOptions.length
                        : 0,
                    );
                    return;
                  }
                  if (
                    e.key === "Backspace" &&
                    input === "" &&
                    pronouns.length > 0
                  ) {
                    e.preventDefault();
                    removeLastPronoun();
                    return;
                  }
                  if (SEPARATOR_KEYS.includes(e.key)) {
                    e.preventDefault();
                    if (q.length > 0 && q.length <= 6 && !pronouns.includes(q))
                      addPronoun(q);
                    return;
                  }
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const active = showPopover && allOptions[activeIndex];
                    if (active) addPronoun(active);
                    else if (
                      q.length > 0 &&
                      q.length <= 6 &&
                      !pronouns.includes(q)
                    )
                      addPronoun(q);
                    return;
                  }
                  if (e.key === "Escape") {
                    setPopoverOpen(false);
                  }
                }}
              />
            )}
          </span>
        </ComboboxPopover.Anchor>
        <ComboboxPopover.Portal>
          <ComboboxPopover.Content
            className="data-[state=open]:shadow-block-sm z-50 w-(--radix-popover-trigger-width) rounded-sm border border-white/20 bg-mauve-900 transition-shadow data-[state=open]:delay-200"
            sideOffset={4}
            align="start"
            onOpenAutoFocus={(e: Event) => e.preventDefault()}
            onInteractOutside={() => setPopoverOpen(false)}
          >
            <div
              ref={listRef}
              role="listbox"
              id={listboxId}
              aria-label="Pronoun suggestions"
              className="flex flex-col py-1"
            >
              {suggestions.map((s, i) => (
                <button
                  key={s}
                  type="button"
                  role="option"
                  id={`${uid}-option-${i}`}
                  aria-selected={i === activeIndex}
                  tabIndex={-1}
                  data-active={i === activeIndex ? true : undefined}
                  className="px-3 py-1.5 text-left text-sm text-mauve-200 transition-colors hover:bg-mauve-700 hover:text-white data-active:bg-mauve-700 data-active:text-white"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    addPronoun(s);
                  }}
                >
                  {s}
                </button>
              ))}
              {canAddCustom && (
                <button
                  type="button"
                  role="option"
                  id={`${uid}-option-${suggestions.length}`}
                  aria-selected={suggestions.length === activeIndex}
                  tabIndex={-1}
                  data-active={
                    suggestions.length === activeIndex ? true : undefined
                  }
                  className="px-3 py-1.5 text-left text-sm text-mauve-400 transition-colors hover:bg-mauve-700 hover:text-white data-active:bg-mauve-700 data-active:text-white"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    addPronoun(q);
                  }}
                >
                  Add &ldquo;{q}&rdquo;
                </button>
              )}
            </div>
          </ComboboxPopover.Content>
        </ComboboxPopover.Portal>
      </ComboboxPopover.Root>

      <InlineSave
        show={dirty}
        isPending={mutation.isPending}
        onSave={() => mutation.mutate(pronouns)}
        onReset={() => setPronouns([...saved])}
        focused={shortcut.focused}
      />
    </div>
  );
}
