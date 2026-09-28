"use client";

import { CaretDownIcon } from "@phosphor-icons/react/ssr";
import { useEffect, useId, useRef, useState } from "react";
import { ComboboxPopover } from "~/ui/combobox";

export interface TeamOption {
  id: string;
  name: string;
  /** Shown, but not pickable, with this as the reason. */
  disabledReason?: string;
}

/**
 * Pick one team by typing part of its name.
 *
 * A combobox even when there is one option: the field reads the same on every
 * page, and a lone team still shows up as the one being asked, rather than
 * the form quietly deciding for the member. Typing past a picked name clears
 * the pick, so the input never shows one team while holding another.
 */
export default function TeamCombobox({
  id,
  options,
  value,
  onChange,
}: {
  id: string;
  options: TeamOption[];
  value: string | null;
  onChange: (teamId: string | null) => void;
}) {
  const selected = options.find((option) => option.id === value) ?? null;
  const [input, setInput] = useState(selected?.name ?? "");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const uid = useId();
  const listboxId = `${uid}-listbox`;

  // While a team is picked the input holds its full name, which would filter
  // the list down to that one team. Opening on a pick shows every team.
  const query = input === selected?.name ? "" : input.trim().toLowerCase();
  const matches = options.filter((option) =>
    option.name.toLowerCase().includes(query),
  );

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>("[data-active]")
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  function pick(option: TeamOption) {
    if (option.disabledReason) return;
    onChange(option.id);
    setInput(option.name);
    setOpen(false);
  }

  function step(delta: number) {
    setActiveIndex((index) =>
      matches.length ? (index + delta + matches.length) % matches.length : 0,
    );
  }

  return (
    <ComboboxPopover.Root open={open} onOpenChange={setOpen}>
      <ComboboxPopover.Anchor asChild>
        <span className="relative flex items-center rounded-sm border border-mauve-600 bg-mauve-800 text-sm transition-shadow focus-within:ring-2 focus-within:ring-white focus-within:ring-offset-1 focus-within:ring-offset-mauve-950 hover:border-mauve-500">
          <input
            id={id}
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={
              open && matches[activeIndex]
                ? `${uid}-option-${matches[activeIndex].id}`
                : undefined
            }
            autoComplete="off"
            spellCheck={false}
            value={input}
            placeholder="Search teams…"
            className="min-w-0 flex-1 border-0 bg-transparent px-3 py-2 text-sm text-white placeholder:text-mauve-500 focus:ring-0 focus:outline-none"
            onChange={(event) => {
              setInput(event.target.value);
              if (value !== null) onChange(null);
              setActiveIndex(0);
              setOpen(true);
            }}
            onFocus={() => {
              setActiveIndex(0);
              setOpen(true);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                if (open) step(1);
                else setOpen(true);
                return;
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                step(-1);
                return;
              }
              if (event.key === "Enter") {
                // Enter picks while the list is open, and otherwise submits
                // the form the way it would from any other field.
                if (!open) return;
                event.preventDefault();
                const option = matches[activeIndex];
                if (option) pick(option);
                return;
              }
              if (event.key === "Escape") setOpen(false);
            }}
          />
          <CaretDownIcon
            aria-hidden
            className="pointer-events-none mr-3 shrink-0 text-mauve-400"
          />
        </span>
      </ComboboxPopover.Anchor>
      <ComboboxPopover.Portal>
        <ComboboxPopover.Content
          className="data-[state=open]:shadow-block-sm z-50 max-h-72 w-(--radix-popover-trigger-width) overflow-y-auto rounded-sm border border-white/20 bg-mauve-900 transition-shadow"
          sideOffset={4}
          align="start"
          onOpenAutoFocus={(event: Event) => event.preventDefault()}
          onInteractOutside={() => setOpen(false)}
        >
          <div
            ref={listRef}
            role="listbox"
            id={listboxId}
            aria-label="Teams"
            className="flex flex-col py-1"
          >
            {matches.length > 0 ? (
              matches.map((option, index) => (
                <button
                  key={option.id}
                  type="button"
                  role="option"
                  id={`${uid}-option-${option.id}`}
                  aria-selected={option.id === value}
                  aria-disabled={option.disabledReason ? true : undefined}
                  tabIndex={-1}
                  data-active={index === activeIndex ? true : undefined}
                  className="flex w-full min-w-0 items-baseline justify-between gap-3 px-3 py-2 text-left text-sm text-mauve-200 transition-colors hover:bg-mauve-700 hover:text-white aria-disabled:cursor-not-allowed aria-disabled:text-mauve-500 aria-disabled:hover:bg-transparent aria-selected:font-semibold aria-selected:text-white data-active:bg-mauve-700 data-active:text-white aria-disabled:data-active:bg-transparent aria-disabled:data-active:text-mauve-500"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    pick(option);
                  }}
                >
                  <span className="min-w-0 truncate">{option.name}</span>
                  {option.disabledReason && (
                    <span className="shrink-0 text-xs">
                      {option.disabledReason}
                    </span>
                  )}
                </button>
              ))
            ) : (
              <p className="px-3 py-2 text-sm text-mauve-400">
                No team by that name.
              </p>
            )}
          </div>
        </ComboboxPopover.Content>
      </ComboboxPopover.Portal>
    </ComboboxPopover.Root>
  );
}
