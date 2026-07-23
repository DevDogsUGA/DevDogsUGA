"use client";

import { useId, useLayoutEffect, useRef } from "react";
import InlineSave from "~/ui/inline-save";
import {
  normalizeRoleDescription,
  useRoleDescription,
} from "~/hooks/useRoleDescription";
import { useSaveShortcut } from "~/hooks/useSaveShortcut";
import { useUnsavedChangesWarning } from "~/hooks/useUnsavedChangesWarning";
import type { getProfilePageData } from "~/server/loaders/console";

type ProfileData = Awaited<ReturnType<typeof getProfilePageData>>;

const MAX_CHARS = 127;

export default function RoleDescriptionField({ id, profile }: ProfileData) {
  const textareaId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const {
    roleDescription,
    setRoleDescription,
    roleDescriptionDirty,
    saveRoleDescription,
    resetRoleDescription,
    isRoleDescriptionPending,
  } = useRoleDescription(id, profile.roleDescription ?? null);
  useUnsavedChangesWarning(roleDescriptionDirty);

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [roleDescription]);

  // Validate the normalized value so trailing spaces don't cause false positives.
  const normalized = normalizeRoleDescription(roleDescription);
  const hasError = normalized.length > MAX_CHARS;
  const lineCount = roleDescription.split("\n").length;
  const shortcut = useSaveShortcut(
    saveRoleDescription,
    roleDescriptionDirty && !hasError && !isRoleDescriptionPending,
  );

  return (
    <div
      className="max-w-sm"
      onFocus={shortcut.onFocus}
      onBlur={shortcut.onBlur}
    >
      <div
        className={`group focus-within:shadow-block-sm relative flex overflow-hidden rounded-sm border bg-mauve-900 text-sm transition-shadow ${hasError ? "border-rose-400" : "border-mauve-600 hover:border-mauve-500"}`}
      >
        <textarea
          ref={textareaRef}
          id={textareaId}
          className="form-textarea w-full resize-none overflow-hidden border-0 bg-mauve-800 px-3 text-sm text-white transition-[height] duration-200 ease-in-out group-hover:inset-shadow-sm placeholder:text-mauve-500 focus:ring-0 focus:inset-shadow-sm"
          value={roleDescription}
          onChange={(e) => setRoleDescription(e.target.value)}
          rows={1}
          name="roleDescription"
          placeholder="Describe what you do in this role…"
        />
      </div>
      <InlineSave
        show={roleDescriptionDirty && !hasError}
        isPending={isRoleDescriptionPending}
        onSave={saveRoleDescription}
        onReset={resetRoleDescription}
        meta={`${roleDescription.length} / ${MAX_CHARS} characters`}
        secondaryMeta={lineCount > 1 ? `${lineCount} / 3 lines` : undefined}
        focused={shortcut.focused}
      />
    </div>
  );
}
