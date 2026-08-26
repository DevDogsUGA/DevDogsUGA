"use client";

import { useId, useLayoutEffect, useRef } from "react";
import { useBio } from "~/hooks/useBio";
import type { getProfilePageData } from "~/server/loaders/console";
import SettingsField from "~/ui/settings-field";
import { PROFILE_LIMITS } from "~/lib/validation/profile";

type ProfileData = Awaited<ReturnType<typeof getProfilePageData>>;

export default function BioField({ id, profile }: ProfileData) {
  const textareaId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { bio, setBio, bioDirty, bioError, saveBio, resetBio } = useBio(
    id,
    profile.bio ?? null,
  );

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [bio]);

  const lineCount = bio.split("\n").length;

  return (
    <SettingsField
      id="bio"
      label="Bio"
      className="max-w-sm"
      isDirty={bioDirty}
      error={bioError}
      save={saveBio}
      reset={resetBio}
      meta={`${bio.length} / ${PROFILE_LIMITS.shortText} characters`}
      secondaryMeta={lineCount > 1 ? `${lineCount} / 3 lines` : undefined}
    >
      <div
        className={`group focus-within:shadow-block-sm relative flex overflow-hidden rounded-sm border bg-mauve-900 text-sm transition-shadow ${bioError ? "border-rose-400" : "border-mauve-600 hover:border-mauve-500"}`}
      >
        <textarea
          ref={textareaRef}
          id={textareaId}
          className="form-textarea w-full resize-none overflow-hidden border-0 bg-mauve-800 px-3 text-sm text-white transition-[height] duration-200 ease-in-out group-hover:inset-shadow-sm placeholder:text-mauve-500 focus:ring-0 focus:inset-shadow-sm"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          aria-invalid={bioError ? true : undefined}
          rows={1}
          name="bio"
          placeholder="Tell people a bit about yourself…"
        />
      </div>
    </SettingsField>
  );
}
