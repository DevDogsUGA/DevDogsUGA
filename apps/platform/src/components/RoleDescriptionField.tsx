"use client";

import { useId, useLayoutEffect, useRef } from "react";
import { useRoleDescription } from "~/hooks/useRoleDescription";
import SettingsField from "~/ui/settings-field";
import { PROFILE_LIMITS } from "~/lib/validation/profile";
import type { getProfilePageData } from "~/server/loaders/console";

type ProfileData = Awaited<ReturnType<typeof getProfilePageData>>;

export default function RoleDescriptionField({ id, profile }: ProfileData) {
  const textareaId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const {
    roleDescription,
    setRoleDescription,
    roleDescriptionDirty,
    roleDescriptionError,
    saveRoleDescription,
    resetRoleDescription,
  } = useRoleDescription(id, profile.roleDescription ?? null);

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [roleDescription]);

  return (
    <SettingsField
      id="roleDescription"
      label="Role Description"
      className="max-w-sm"
      isDirty={roleDescriptionDirty}
      error={roleDescriptionError}
      save={saveRoleDescription}
      reset={resetRoleDescription}
      meta={`${roleDescription.length} / ${PROFILE_LIMITS.roleDescription} characters`}
    >
      <div
        className={`group focus-within:shadow-block-sm relative flex overflow-hidden rounded-sm border bg-mauve-900 text-sm transition-shadow ${roleDescriptionError ? "border-rose-400" : "border-mauve-600 hover:border-mauve-500"}`}
      >
        <textarea
          ref={textareaRef}
          id={textareaId}
          className="form-textarea w-full resize-none overflow-hidden border-0 bg-mauve-800 px-3 text-sm text-white transition-[height] duration-200 ease-in-out group-hover:inset-shadow-sm placeholder:text-mauve-500 focus:ring-0 focus:inset-shadow-sm"
          value={roleDescription}
          onChange={(e) => setRoleDescription(e.target.value)}
          aria-invalid={roleDescriptionError ? true : undefined}
          maxLength={PROFILE_LIMITS.roleDescription}
          rows={1}
          name="roleDescription"
          placeholder="Describe what you do in this role…"
        />
      </div>
    </SettingsField>
  );
}
