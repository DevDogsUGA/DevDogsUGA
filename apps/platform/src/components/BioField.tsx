"use client";

import { useId, useLayoutEffect, useRef } from "react";
import { useBio, normalizeBio } from "~/hooks/useBio";
import type { getProfilePageData } from "~/server/loaders/console";
import SaveableField from "~/ui/saveable-field";

type ProfileData = Awaited<ReturnType<typeof getProfilePageData>>;

const MAX_CHARS = 127;

export default function BioField({ id, profile }: ProfileData) {
  const textareaId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { bio, setBio, bioDirty, saveBio, resetBio, isBioPending } = useBio(
    id,
    profile.bio ?? null,
  );

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [bio]);

  const normalized = normalizeBio(bio);
  const hasError = normalized.length > MAX_CHARS;
  const lineCount = bio.split("\n").length;

  return (
    <SaveableField
      className="max-w-sm"
      isDirty={bioDirty && !hasError}
      isPending={isBioPending}
      onSave={saveBio}
      onReset={resetBio}
      meta={`${bio.length} / ${MAX_CHARS} characters`}
      secondaryMeta={lineCount > 1 ? `${lineCount} / 3 lines` : undefined}
    >
      <div
        className={`group focus-within:shadow-block-sm relative flex overflow-hidden rounded-sm border bg-mauve-900 text-sm transition-shadow ${hasError ? "border-rose-400" : "border-mauve-600 hover:border-mauve-500"}`}
      >
        <textarea
          ref={textareaRef}
          id={textareaId}
          className="form-textarea w-full resize-none overflow-hidden border-0 bg-mauve-800 px-3 text-sm text-white transition-[height] duration-200 ease-in-out group-hover:inset-shadow-sm placeholder:text-mauve-500 focus:ring-0 focus:inset-shadow-sm"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={1}
          name="bio"
          placeholder="Tell people a bit about yourself…"
        />
      </div>
    </SaveableField>
  );
}
