"use client";

import { ComboboxPopover, LB_ITEM } from "~/ui/combobox";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { XIcon } from "@phosphor-icons/react/ssr";
import SettingsField from "~/ui/settings-field";
import type { getProfilePageData } from "~/server/loaders/console";
import { createClient } from "~/supabase/client";
import revalidateOfficerBoard from "~/server/actions/revalidateOfficerBoard";
import { PROFILE_LIMITS, validatePronouns } from "~/lib/validation/profile";

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

const MAX_PRONOUNS = PROFILE_LIMITS.pronounCount;
const MAX_PRONOUN_CHARS = PROFILE_LIMITS.pronounChars;

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
      return values;
    },
    onSuccess: (values) => {
      setSaved([...values]);
      void revalidateOfficerBoard().catch(() => undefined);
    },
  });

  const dirty = JSON.stringify(pronouns) !== JSON.stringify(saved);
  const error = validatePronouns(pronouns);
  const q = input.toLowerCase().trim();
  const suggestions = PRONOUN_SUGGESTIONS.filter(
    (s) => s.startsWith(q) && !pronouns.includes(s),
  );
  const canAddCustom =
    q.length > 0 &&
    q.length <= MAX_PRONOUN_CHARS &&
    !pronouns.includes(q) &&
    !PRONOUN_SUGGESTIONS.includes(q);
  const allOptions = [...suggestions, ...(canAddCustom ? [q] : [])];
  const showPopover =
    popoverOpen && allOptions.length > 0 && pronouns.length < MAX_PRONOUNS;

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>("[data-active]")
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  function addPronoun(p: string) {
    if (pronouns.length < MAX_PRONOUNS) setPronouns((prev) => [...prev, p]);
    setInput("");
    setActiveIndex(0);
    setPopoverOpen(false);
    inputRef.current?.focus();
  }

  function removeLastPronoun() {
    setPronouns((prev) => prev.slice(0, -1));
  }

  return (
    <SettingsField
      id="pronouns"
      label="Pronouns"
      draft={pronouns}
      isDirty={dirty}
      error={error}
      save={async () => {
        await mutation.mutateAsync(pronouns);
      }}
      reset={() => setPronouns([...saved])}
    >
      <div className="set-tags empty:hidden">
        {pronouns.map((p) => (
          <span key={p} className="tag">
            {p}
            <button
              type="button"
              onClick={() => setPronouns((prev) => prev.filter((x) => x !== p))}
              aria-label={`Remove ${p}`}
            >
              <XIcon />
            </button>
          </span>
        ))}
      </div>
      <ComboboxPopover.Root open={showPopover} onOpenChange={setPopoverOpen}>
        <ComboboxPopover.Anchor asChild>
          <span className="input max-w-[360px]">
            {pronouns.length < MAX_PRONOUNS && (
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
                maxLength={MAX_PRONOUN_CHARS}
                placeholder="Add pronouns…"
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
                    if (
                      q.length > 0 &&
                      q.length <= MAX_PRONOUN_CHARS &&
                      !pronouns.includes(q)
                    )
                      addPronoun(q);
                    return;
                  }
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const active = showPopover && allOptions[activeIndex];
                    if (active) addPronoun(active);
                    else if (
                      q.length > 0 &&
                      q.length <= MAX_PRONOUN_CHARS &&
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
            className="z-50 w-(--radix-popover-trigger-width)"
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
              className="flex flex-col"
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
                  className={`${LB_ITEM} text-left data-[active]:bg-[color-mix(in_srgb,var(--raised)_86%,#fff)] data-[active]:text-[var(--text)]`}
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
                  className={`${LB_ITEM} text-left data-[active]:bg-[color-mix(in_srgb,var(--raised)_86%,#fff)] data-[active]:text-[var(--text)]`}
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
    </SettingsField>
  );
}
