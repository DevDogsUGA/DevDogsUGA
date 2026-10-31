"use client";

import { useCallback, useId, useMemo, useRef, useState } from "react";
import {
  CaretDownIcon,
  CaretUpIcon,
  TrashIcon,
} from "@phosphor-icons/react/ssr";
import { useProfileLinks, type DraftLink } from "~/hooks/useProfileLinks";
import {
  isValidLinkUrl,
  PROFILE_LIMITS,
  validateLinks,
  validateLinkUrl,
} from "~/lib/validation/profile";
import type { profileLinks } from "~/server/db/schema";
import Input from "~/components/Input";
import {
  FieldError,
  useBlurredError,
  useSettingsField,
} from "~/ui/settings-form";
import AddLinkInput from "./AddLinkInput";

interface Props {
  initialLinks: (typeof profileLinks.$inferSelect)[];
}

/** A sort order that lands between two neighbours (either may be missing). */
function between(left: DraftLink | undefined, right: DraftLink | undefined) {
  if (left === undefined) return (right?.sortOrder ?? 1) - 1;
  if (right === undefined) return left.sortOrder + 1;
  return (left.sortOrder + right.sortOrder) / 2;
}

/**
 * The profile links: up to five, each a title and an address, reordered with
 * arrows. Nothing is written until the page's Save (`useSettingsField`); the
 * add box folds into the draft when Save is pressed, so a link typed but not
 * yet added is not lost.
 */
export default function ProfileLinks({ initialLinks }: Props) {
  const urlInputId = useId();
  const {
    links,
    isDirtyFor,
    addLink,
    removeLink,
    updateLink,
    reorderLink,
    save,
    reset,
  } = useProfileLinks(initialLinks);

  const [urlInput, setUrlInput] = useState("");
  const [titleInput, setTitleInput] = useState("");
  const titleInputRef = useRef<HTMLInputElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);

  const urlIsValid = isValidLinkUrl(urlInput);
  const trimmedTitle = titleInput.trim();
  const atMax = links.length >= PROFILE_LIMITS.linkCount;

  /** The draft with the add box folded in, as `save` will commit it. */
  const pending = useMemo<DraftLink | null>(
    () =>
      urlIsValid && !atMax
        ? {
            id: "__pending__",
            url: urlInput,
            title: trimmedTitle || null,
            sortOrder: (links.at(-1)?.sortOrder ?? 0) + 1,
            isNew: true,
          }
        : null,
    [urlIsValid, atMax, urlInput, trimmedTitle, links],
  );
  const staged = pending ? [...links, pending] : links;

  const pendingUrlError =
    urlInput.trim().length > 0 && !urlIsValid
      ? validateLinkUrl(urlInput)
      : null;
  const listError = validateLinks(staged);
  const error = listError ?? pendingUrlError;

  const blurred = useBlurredError(pendingUrlError);
  const visibleError = listError ?? blurred.error;

  const clearInput = useCallback(() => {
    setUrlInput("");
    setTitleInput("");
  }, []);

  const materialize = useCallback((): DraftLink[] => {
    if (!pending) return links;
    const realId = addLink(pending.url, pending.title, pending.sortOrder);
    clearInput();
    return [...links, { ...pending, id: realId }];
  }, [pending, links, addLink, clearInput]);

  const { isSaving, serverError } = useSettingsField({
    id: "links",
    draft: [staged, urlInput, titleInput],
    label: "Links",
    isDirty: isDirtyFor(staged) || pendingUrlError !== null,
    error,
    save: () => save(materialize()),
    reset: () => {
      reset();
      clearInput();
    },
  });

  const handleAdd = useCallback(() => {
    if (!pending) return;
    materialize();
  }, [pending, materialize]);

  function move(index: number, direction: -1 | 1) {
    const link = links[index]!;
    const target = index + direction;
    if (direction === -1) {
      reorderLink(link.id, between(links[target - 1], links[target]));
    } else {
      reorderLink(link.id, between(links[target], links[target + 1]));
    }
  }

  return (
    <div onBlur={blurred.onBlur}>
      <div role="list" aria-label="Your links">
        {links.map((link, i) => {
          const name = link.title?.trim() ? link.title : link.url;
          return (
            <div role="listitem" className="set-link" key={link.id}>
              <span className="mv">
                <button
                  type="button"
                  className="iconbtn"
                  aria-label={`Move ${name} up`}
                  disabled={isSaving || i === 0}
                  onClick={() => move(i, -1)}
                >
                  <CaretUpIcon weight="bold" />
                </button>
                <button
                  type="button"
                  className="iconbtn"
                  aria-label={`Move ${name} down`}
                  disabled={isSaving || i === links.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <CaretDownIcon weight="bold" />
                </button>
              </span>
              <label className="field">
                <span className="label">Title</span>
                <Input
                  value={link.title ?? ""}
                  maxLength={PROFILE_LIMITS.linkTitle}
                  disabled={isSaving}
                  onChange={(e) =>
                    updateLink(link.id, link.url, e.target.value || null)
                  }
                />
              </label>
              <label className="field u">
                <span className="label">Address</span>
                <Input
                  mono
                  type="url"
                  value={link.url}
                  disabled={isSaving}
                  onChange={(e) =>
                    updateLink(link.id, e.target.value, link.title)
                  }
                />
              </label>
              <button
                type="button"
                className="iconbtn"
                aria-label={`Remove link ${name}`}
                disabled={isSaving}
                onClick={() => removeLink(link.id)}
              >
                <TrashIcon />
              </button>
            </div>
          );
        })}
      </div>

      {!atMax ? (
        <div style={{ marginTop: links.length > 0 ? 16 : 0 }}>
          <AddLinkInput
            id={urlInputId}
            urlValue={urlInput}
            onUrlChange={setUrlInput}
            titleValue={titleInput}
            onTitleChange={setTitleInput}
            onSubmit={handleAdd}
            submitLabel="Add"
            canSubmit={urlIsValid && !isSaving}
            disabled={isSaving}
            titleInputRef={titleInputRef}
            urlInputRef={urlInputRef}
          />
        </div>
      ) : null}
      <p className="small muted" style={{ marginTop: 10 }}>
        {atMax
          ? `You can't add more than ${PROFILE_LIMITS.linkCount} links.`
          : `${links.length} of ${PROFILE_LIMITS.linkCount} links used.`}
      </p>

      <FieldError error={serverError ?? visibleError} />
    </div>
  );
}
