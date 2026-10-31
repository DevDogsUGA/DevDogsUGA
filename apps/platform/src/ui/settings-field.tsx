"use client";

import type { ReactNode } from "react";
import {
  FieldError,
  useBlurredError,
  useSettingsField,
  type SettingsFieldRegistration,
} from "~/ui/settings-form";

interface SettingsFieldProps {
  /** Stable identity within the form. */
  id: string;
  /** Human name, read back by the save bar when a write fails. */
  label: string;
  isDirty: boolean;
  draft: unknown;
  /** From ~/lib/validation/profile. Blocks the save and shows on blur. */
  error: string | null;
  save: SettingsFieldRegistration["save"];
  reset: () => void;
  className?: string;
  /** Counters and the like. Appears only while the field is dirty. */
  meta?: ReactNode;
  secondaryMeta?: ReactNode;
  children: ReactNode;
}

/**
 * Wraps a field with nothing unusual about it: local state, one error, one
 * write. Replaces `SaveableField`, which carried its own save and reset
 * buttons. Those now live once, at the bottom of the page.
 *
 * Fields with their own interaction model (the pronoun combobox, the two
 * graduation selects, the links list) call `useSettingsField` directly.
 */
export default function SettingsField({
  id,
  label,
  isDirty,
  draft,
  error,
  save,
  reset,
  className,
  meta,
  secondaryMeta,
  children,
}: SettingsFieldProps) {
  const { serverError } = useSettingsField({
    id,
    label,
    isDirty,
    draft,
    error,
    save,
    reset,
  });
  const blurred = useBlurredError(error);

  return (
    <div className={className} onBlur={blurred.onBlur}>
      {children}
      <FieldError error={serverError ?? blurred.error} />
      {(Boolean(meta) || Boolean(secondaryMeta)) && (
        <div
          className={`grid transition-[grid-template-rows] duration-200 ease-in-out ${
            isDirty ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          }`}
        >
          <div className="flex min-h-0 flex-col overflow-hidden pt-2 text-[12.5px] leading-tight text-[var(--text-3)] *:truncate *:transition-[height] *:data-hidden:h-0">
            <span data-hidden={!meta || undefined}>{meta}</span>
            <span data-hidden={!secondaryMeta || undefined}>
              {secondaryMeta}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
