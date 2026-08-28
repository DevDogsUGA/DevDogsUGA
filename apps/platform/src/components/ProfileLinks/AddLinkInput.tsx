"use client";

import { useState, type RefObject } from "react";
import { CheckIcon, LinkIcon, PlusIcon, TagIcon } from "@phosphor-icons/react/ssr";
import { isValidLinkUrl, PROFILE_LIMITS } from "~/lib/validation/profile";

interface AddLinkInputProps {
  id?: string;
  urlValue: string;
  onUrlChange: (v: string) => void;
  titleValue: string;
  onTitleChange: (v: string) => void;
  /** Stages the typed link into the draft list. Local; nothing is written. */
  onSubmit: () => void;
  /** "Add" for a new link, "Apply" when editing an existing one. */
  submitLabel: string;
  canSubmit: boolean;
  disabled: boolean;
  titleInputRef?: RefObject<HTMLInputElement | null>;
  urlInputRef?: RefObject<HTMLInputElement | null>;
}

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
  const [focusedField, setFocusedField] = useState<"title" | "url" | null>(
    null,
  );

  const iconSlot = `shrink-0 overflow-hidden transition-[width] duration-200 ease-in-out ${
    split ? "w-[26px]" : "w-0"
  }`;

  /**
   * `has-[input:disabled]:`, not the blanket `has-disabled:` this used to
   * carry.
   *
   * The Add button lives in the bottom row, and it is disabled whenever the
   * URL is not yet usable — which includes the empty box you are handed on
   * arrival. `has-disabled:` matches any disabled descendant, so that button
   * dimmed the field and, worse, took `pointer-events-none` with it: the URL
   * input could not be clicked into, so no URL could be typed, so the button
   * stayed disabled. The field read as disabled because every part of it that
   * says "disabled" was on.
   *
   * Keying on a disabled *input* instead says what was always meant — the
   * field is off when its inputs are off, which is the `disabled` prop.
   */
  const rowBase =
    "flex items-center bg-mauve-800 transition-shadow focus-within:inset-shadow-sm hover:inset-shadow-sm has-[input:disabled]:bg-mauve-900/50 has-[input:disabled]:pointer-events-none";

  const inputBase =
    "form-input w-full border-0 bg-transparent px-3 py-2.25 text-sm text-white placeholder:text-mauve-500 focus:ring-0 disabled:pointer-events-none disabled:text-mauve-500";

  return (
    <div
      role="group"
      aria-label="Add link"
      className="focus-within:shadow-block-sm max-w-sm overflow-hidden rounded-sm border border-mauve-600 bg-mauve-900 text-sm transition-shadow hover:border-mauve-500 has-[input:disabled]:cursor-not-allowed has-[input:disabled]:border-mauve-700 has-[input:disabled]:bg-mauve-900/50"
    >
      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-in-out ${
          split ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className={`${rowBase} border-b border-mauve-600`}>
            <div aria-hidden="true" className={iconSlot}>
              <div className="flex items-center pl-3">
                <TagIcon
                  size={14}
                  className={`transition-colors ${focusedField === "title" ? "text-white" : "text-mauve-500"}`}
                />
              </div>
            </div>
            <input
              ref={titleInputRef}
              type="text"
              value={titleValue}
              onChange={(e) => onTitleChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !disabled) {
                  e.preventDefault();
                  onSubmit();
                }
              }}
              onFocus={() => setFocusedField("title")}
              onBlur={() => setFocusedField(null)}
              placeholder="Title (optional)"
              // Matches `profileLinks.title`, which is varchar(64). It used to
              // allow 100, which the insert then refused.
              maxLength={PROFILE_LIMITS.linkTitle}
              disabled={disabled}
              tabIndex={split ? 0 : -1}
              aria-hidden={!split}
              aria-label="Link title (optional)"
              className={inputBase}
            />
          </div>
        </div>
      </div>

      <div className={rowBase}>
        <div aria-hidden="true" className={iconSlot}>
          <div className="flex items-center pl-3">
            <LinkIcon
              size={14}
              className={`transition-colors ${focusedField === "url" ? "text-white" : "text-mauve-500"}`}
            />
          </div>
        </div>
        <input
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
          onFocus={() => setFocusedField("url")}
          onBlur={() => setFocusedField(null)}
          placeholder="https://example.com"
          required
          disabled={disabled}
          aria-label="Link URL"
          className={`${inputBase} font-mono`}
        />

        {/* Stages the link into the list. It is not a save — the page's save
            bar is still the only thing that writes — so it reads "Add", and it
            collapses to nothing until the URL is one we can actually use. */}
        <span
          className={`grid shrink-0 overflow-hidden transition-[grid-template-columns] duration-200 ease-in-out ${
            canSubmit ? "grid-cols-[1fr]" : "grid-cols-[0fr]"
          }`}
        >
          <span className="overflow-hidden">
            <button
              type="button"
              onClick={onSubmit}
              disabled={!canSubmit || disabled}
              tabIndex={canSubmit ? 0 : -1}
              className="m-1 flex items-center gap-[0.5ch] rounded-sm border border-mauve-600 bg-mauve-700 px-2.5 py-1 text-xs font-medium whitespace-nowrap text-mauve-100 transition-colors outline-none hover:border-mauve-500 hover:bg-mauve-600 hover:text-white focus-visible:ring-2 focus-visible:ring-mauve-400 disabled:pointer-events-none disabled:opacity-50"
            >
              {submitLabel === "Apply" ? (
                <CheckIcon size={12} aria-hidden />
              ) : (
                <PlusIcon size={12} aria-hidden />
              )}
              {submitLabel}
            </button>
          </span>
        </span>
      </div>
    </div>
  );
}
