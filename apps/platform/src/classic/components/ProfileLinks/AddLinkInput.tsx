"use client";

import { type RefObject } from "react";
import { cn } from "~/lib/cn";
import { PlusIcon } from "@phosphor-icons/react/ssr";
import FormButton from "~/classic/components/FormButton";
import { isValidLinkUrl, PROFILE_LIMITS } from "~/lib/validation/profile";

/**
 * The baseline text field, on a bare input: `Input`'s wrapper switches itself
 * off with `has-disabled:`, which is the selector this row must never carry
 * (see the note on the component).
 */
const FIELD =
  "w-full rounded-sm border border-mauve-600 bg-mauve-800 px-3 py-1.5 text-sm text-white outline-none placeholder:text-mauve-500 hover:border-mauve-500 focus:border-white disabled:cursor-not-allowed disabled:opacity-60";

interface AddLinkInputProps {
  id?: string;
  urlValue: string;
  onUrlChange: (v: string) => void;
  titleValue: string;
  onTitleChange: (v: string) => void;
  /** Stages the typed link into the draft list. Local; nothing is written. */
  onSubmit: () => void;
  /** "Add" for a new link. */
  submitLabel: string;
  canSubmit: boolean;
  disabled: boolean;
  titleInputRef?: RefObject<HTMLInputElement | null>;
  urlInputRef?: RefObject<HTMLInputElement | null>;
}

/**
 * The add-a-link row: an address and, once the address is usable, an optional
 * title. Enter in either box stages the link.
 *
 * The disabled styling keys on `has-[input:disabled]:`, never a blanket
 * `has-disabled:`: the Add button is disabled until the address is valid, and
 * a blanket selector would let it switch off the box you type the address into
 * (AddLinkInput.test.tsx pins this).
 */
export default function AddLinkInput({
  id,
  urlValue,
  onUrlChange,
  titleValue,
  onTitleChange,
  onSubmit,
  submitLabel,
  canSubmit,
  disabled,
  titleInputRef,
  urlInputRef,
}: AddLinkInputProps) {
  const split = isValidLinkUrl(urlValue);

  return (
    <div
      role="group"
      aria-label="Add link"
      className="flex flex-wrap items-end gap-3 has-[input:disabled]:cursor-not-allowed has-[input:disabled]:opacity-60"
    >
      <label
        className="flex min-w-52 flex-[1.5] flex-col gap-1.5 text-xs text-mauve-300"
        htmlFor={id}
      >
        New link address
        <input
          className={cn(FIELD, "font-mono")}
          ref={urlInputRef}
          id={id}
          type="url"
          value={urlValue}
          onChange={(e) => onUrlChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && split && !disabled) {
              e.preventDefault();
              onSubmit();
            }
          }}
          placeholder="https://example.com"
          disabled={disabled}
          aria-label="Link URL"
        />
      </label>
      {split && (
        <label
          className="flex min-w-40 flex-1 flex-col gap-1.5 text-xs text-mauve-300"
          htmlFor={id ? `${id}-title` : undefined}
        >
          Title (optional)
          <input
            className={FIELD}
            ref={titleInputRef}
            id={id ? `${id}-title` : undefined}
            type="text"
            value={titleValue}
            onChange={(e) => onTitleChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !disabled) {
                e.preventDefault();
                onSubmit();
              }
            }}
            // Matches `profileLinks.title`, which is varchar(64).
            maxLength={PROFILE_LIMITS.linkTitle}
            disabled={disabled}
            aria-label="Link title (optional)"
          />
        </label>
      )}
      <FormButton
        theme="black"
        type="button"
        onClick={onSubmit}
        disabled={!canSubmit || disabled}
        className="text-sm"
      >
        <PlusIcon aria-hidden />
        {submitLabel}
      </FormButton>
    </div>
  );
}
