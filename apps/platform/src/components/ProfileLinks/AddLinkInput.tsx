"use client";

import { useState, type RefObject } from "react";
import { LinkIcon, TagIcon } from "@phosphor-icons/react/ssr";
import { isValidLinkUrl } from "./LinkCard";

interface AddLinkInputProps {
  id?: string;
  urlValue: string;
  onUrlChange: (v: string) => void;
  titleValue: string;
  onTitleChange: (v: string) => void;
  onSubmit: () => void;
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
  disabled,
  titleInputRef,
  urlInputRef,
}: AddLinkInputProps) {
  const split = isValidLinkUrl(urlValue);
  const [focusedField, setFocusedField] = useState<"title" | "url" | null>(null);

  const iconSlot = `shrink-0 overflow-hidden transition-[width] duration-200 ease-in-out ${
    split ? "w-[26px]" : "w-0"
  }`;

  const rowBase =
    "flex items-center bg-mauve-800 transition-shadow focus-within:inset-shadow-sm hover:inset-shadow-sm has-disabled:bg-mauve-900/50 has-disabled:pointer-events-none";

  const inputBase =
    "form-input w-full border-0 bg-transparent px-3 py-2.25 text-sm text-white placeholder:text-mauve-500 focus:ring-0 disabled:pointer-events-none disabled:text-mauve-500";

  return (
    <div
      role="group"
      aria-label="Add link"
      className="focus-within:shadow-block-sm max-w-sm overflow-hidden rounded-sm border border-mauve-600 bg-mauve-900 text-sm transition-shadow hover:border-mauve-500 has-disabled:cursor-not-allowed has-disabled:border-mauve-700 has-disabled:bg-mauve-900/50"
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
              maxLength={100}
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
      </div>
    </div>
  );
}
