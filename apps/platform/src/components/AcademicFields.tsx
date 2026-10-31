"use client";

import { MagnifyingGlassIcon, XIcon } from "@phosphor-icons/react/ssr";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  PROFILE_LIMITS,
  validateAcademicProgramIds,
} from "~/lib/validation/profile";
import { formatAcademicProgram } from "~/lib/academicPrograms";
import updateAcademicPrograms from "~/server/actions/updateAcademicPrograms";
import type { getProfilePageData } from "~/server/loaders/console";
import { ComboboxPopover, LB_ITEM } from "~/ui/combobox";
import SettingsField from "~/ui/settings-field";

type ProfilePageData = Awaited<ReturnType<typeof getProfilePageData>>;
type ProgramOption = ProfilePageData["availableAcademicPrograms"][number];

const CATEGORY_LABELS: Record<ProgramOption["category"], string> = {
  undergraduate_major: "Undergraduate major",
  graduate_major: "Graduate major",
  undergraduate_minor: "Minor",
  undergraduate_certificate: "Undergraduate certificate",
  graduate_certificate: "Graduate certificate",
  professional_program: "Professional program",
};

const CATEGORY_ORDER = [
  "undergraduate_major",
  "graduate_major",
  "undergraduate_minor",
  "undergraduate_certificate",
  "graduate_certificate",
  "professional_program",
] as const satisfies readonly ProgramOption["category"][];

/** Colors mirror the corresponding program icons in the UGA Bulletin. */
const CATEGORY_BADGE_STYLES: Record<ProgramOption["category"], string> = {
  undergraduate_major: "border-[#E4002B] bg-[#E4002B] text-white",
  graduate_major: "border-[#00A3AD] bg-[#00A3AD] text-black",
  undergraduate_minor: "border-[#66435A] bg-[#66435A] text-white",
  undergraduate_certificate: "border-[#C8D8EB] bg-[#C8D8EB] text-black",
  graduate_certificate: "border-[#594A25] bg-[#594A25] text-white",
  professional_program: "border-[#B7BF10] bg-[#B7BF10] text-black",
};

const MAX_PROGRAMS = PROFILE_LIMITS.academicProgramCount;
const MAX_VISIBLE_OPTIONS = 50;

export default function AcademicFields({
  selectedAcademicPrograms,
  availableAcademicPrograms,
}: ProfilePageData) {
  const allPrograms = useMemo(() => {
    const byId = new Map<number, ProgramOption>();
    for (const program of selectedAcademicPrograms)
      byId.set(program.id, program);
    for (const program of availableAcademicPrograms)
      byId.set(program.id, program);
    return byId;
  }, [availableAcademicPrograms, selectedAcademicPrograms]);

  const initialIds = selectedAcademicPrograms.map(({ id }) => id);
  const [programIds, setProgramIds] = useState(initialIds);
  const [saved, setSaved] = useState(initialIds);
  const [input, setInput] = useState("");
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const uid = useId();
  const inputId = useId();
  const listboxId = `${uid}-listbox`;

  const mutation = useMutation({
    mutationFn: (values: number[]) => updateAcademicPrograms(values),
    onSuccess: (result, values) => {
      if (result.ok) setSaved([...(result.data ?? values)]);
    },
  });

  const selectedSet = new Set(programIds);
  const query = input.trim().toLocaleLowerCase();
  const filteredOptions = availableAcademicPrograms
    .filter((program) => {
      if (selectedSet.has(program.id)) return false;
      if (!query) return true;
      return `${program.name} ${program.credential} ${CATEGORY_LABELS[program.category]}`
        .toLocaleLowerCase()
        .includes(query);
    })
    .slice(0, MAX_VISIBLE_OPTIONS);
  const optionGroups = CATEGORY_ORDER.map((category) => ({
    category,
    programs: filteredOptions.filter(
      (program) => program.category === category,
    ),
  })).filter(({ programs }) => programs.length > 0);
  // Keyboard navigation follows the same category-grouped order users see.
  const options = optionGroups.flatMap(({ programs }) => programs);
  const optionIndexById = new Map(
    options.map((program, index) => [program.id, index]),
  );
  const showPopover = popoverOpen && programIds.length < MAX_PROGRAMS;
  const dirty = JSON.stringify(programIds) !== JSON.stringify(saved);
  const error = validateAcademicProgramIds(programIds);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>("[data-active]")
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  function addProgram(program: ProgramOption) {
    if (programIds.length >= MAX_PROGRAMS || selectedSet.has(program.id))
      return;
    setProgramIds((current) => [...current, program.id]);
    setInput("");
    setActiveIndex(0);
    setPopoverOpen(false);
    inputRef.current?.focus();
  }

  function removeProgram(programId: number) {
    setProgramIds((current) => current.filter((id) => id !== programId));
  }

  return (
    <SettingsField
      id="academics"
      label="Academics"
      draft={programIds}
      isDirty={dirty}
      error={error}
      save={() => mutation.mutateAsync(programIds)}
      reset={() => {
        setProgramIds([...saved]);
        setInput("");
      }}
    >
      <div className="set-tags empty:hidden">
        {programIds.map((programId) => {
          const program = allPrograms.get(programId);
          if (!program) return null;
          const label = formatAcademicProgram(program);
          return (
            <span key={program.id} title={label} className="tag">
              <span className="min-w-0 truncate">{program.name}</span>
              <span
                className={`shrink-0 rounded-full border px-1.5 py-px text-[0.65rem] leading-none font-bold ${CATEGORY_BADGE_STYLES[program.category]}`}
              >
                {program.credential}
              </span>
              <button
                type="button"
                onClick={() => removeProgram(program.id)}
                aria-label={`Remove ${label}`}
              >
                <XIcon />
              </button>
            </span>
          );
        })}
      </div>
      <ComboboxPopover.Root open={showPopover} onOpenChange={setPopoverOpen}>
        <ComboboxPopover.Anchor asChild>
          <span className="input max-w-[560px]">
            <MagnifyingGlassIcon
              aria-hidden
              className="shrink-0 text-[var(--text-3)]"
            />
            {programIds.length < MAX_PROGRAMS && (
              <input
                ref={inputRef}
                id={inputId}
                type="text"
                role="combobox"
                aria-expanded={showPopover}
                aria-haspopup="listbox"
                aria-controls={listboxId}
                aria-autocomplete="list"
                aria-activedescendant={
                  showPopover && options[activeIndex]
                    ? `${uid}-option-${options[activeIndex].id}`
                    : undefined
                }
                value={input}
                placeholder="Search programs to add"

                onChange={(event) => {
                  setInput(event.target.value);
                  setActiveIndex(0);
                  setPopoverOpen(true);
                }}
                onFocus={() => {
                  setActiveIndex(0);
                  setPopoverOpen(true);
                }}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setActiveIndex((index) =>
                      options.length ? (index + 1) % options.length : 0,
                    );
                    return;
                  }
                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setActiveIndex((index) =>
                      options.length
                        ? (index - 1 + options.length) % options.length
                        : 0,
                    );
                    return;
                  }
                  if (
                    event.key === "Backspace" &&
                    input === "" &&
                    programIds.length > 0
                  ) {
                    event.preventDefault();
                    setProgramIds((current) => current.slice(0, -1));
                    return;
                  }
                  if (event.key === "Enter") {
                    event.preventDefault();
                    const program = showPopover
                      ? options[activeIndex]
                      : undefined;
                    if (program) addProgram(program);
                    return;
                  }
                  if (event.key === "Escape") setPopoverOpen(false);
                }}
              />
            )}
          </span>
        </ComboboxPopover.Anchor>
        <ComboboxPopover.Portal>
          <ComboboxPopover.Content
            className="z-50 max-h-80 w-(--radix-popover-trigger-width)"
            sideOffset={4}
            align="start"
            onOpenAutoFocus={(event: Event) => event.preventDefault()}
            onInteractOutside={() => setPopoverOpen(false)}
          >
            <div
              ref={listRef}
              role="listbox"
              id={listboxId}
              aria-label="UGA academic programs"
              className="flex flex-col"
            >
              {options.length > 0 ? (
                optionGroups.map(({ category, programs }) => (
                  <div
                    key={category}
                    role="group"
                    aria-labelledby={`${uid}-group-${category}`}
                  >
                    <div
                      id={`${uid}-group-${category}`}
                      className="sticky top-0 z-10 bg-[var(--raised)] px-3 py-1.5 text-[0.65rem] font-bold tracking-wide text-[var(--text-3)] uppercase"
                    >
                      {CATEGORY_LABELS[category]}
                    </div>
                    {programs.map((program) => {
                      const index = optionIndexById.get(program.id) ?? 0;
                      return (
                        <button
                          key={program.id}
                          type="button"
                          role="option"
                          id={`${uid}-option-${program.id}`}
                          title={formatAcademicProgram(program)}
                          aria-selected={false}
                          tabIndex={-1}
                          data-active={index === activeIndex ? true : undefined}
                          className={`${LB_ITEM} w-full min-w-0 text-left data-[active]:bg-[color-mix(in_srgb,var(--raised)_86%,#fff)] data-[active]:text-[var(--text)]`}
                          onMouseDown={(event) => {
                            event.preventDefault();
                            addProgram(program);
                          }}
                        >
                          <span className="min-w-0 truncate">
                            {program.name}
                          </span>
                          <span
                            className={`shrink-0 rounded-full border px-1.5 py-px text-[0.65rem] leading-none font-bold ${CATEGORY_BADGE_STYLES[program.category]}`}
                          >
                            {program.credential}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ))
              ) : (
                <p className="px-3 py-2 text-sm text-[var(--text-3)]">
                  {availableAcademicPrograms.length === 0
                    ? "The UGA program catalog has not synced yet."
                    : "No matching programs."}
                </p>
              )}
            </div>
          </ComboboxPopover.Content>
        </ComboboxPopover.Portal>
      </ComboboxPopover.Root>
    </SettingsField>
  );
}
