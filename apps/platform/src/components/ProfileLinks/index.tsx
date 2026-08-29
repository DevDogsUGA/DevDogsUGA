"use client";

import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DropAnimation,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AnimatePresence, motion } from "motion/react";
import { createPortal } from "react-dom";
import { RemoveScroll } from "react-remove-scroll";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { PencilSimpleIcon, PlusIcon } from "@phosphor-icons/react/ssr";
import { useProfileLinks, type DraftLink } from "~/hooks/useProfileLinks";
import {
  isValidLinkUrl,
  PROFILE_LIMITS,
  validateLinks,
  validateLinkUrl,
} from "~/lib/validation/profile";
import type { profileLinks } from "~/server/db/schema";
import DropTarget from "~/ui/drop-target";
import {
  FieldError,
  useBlurredError,
  useSettingsField,
} from "~/ui/settings-form";
import LinkCard from "./LinkCard";
import AddLinkInput from "./AddLinkInput";

/** Identity of the card that mirrors whatever is currently in the add-link box. */
const PREVIEW_ID = "__preview__";

interface Props {
  initialLinks: (typeof profileLinks.$inferSelect)[];
}

// Merges dnd-kit's sortable ref + transform with Framer Motion's height/opacity animation.
// setNodeRef must be on the motion.div (not a child) so the entire clipped box moves as a
// unit during sorting — applying the transform inside an overflow:hidden parent would clip it.
interface SortableMotionItemProps {
  id: string;
  isJustAdded: boolean;
  link: DraftLink;
  isEditing: boolean;
  actionsDisabled: boolean;
  multipleLinks: boolean;
  listHovered: boolean;
  isDroppingTarget: boolean;
  isActiveDrag: boolean;
  anyEditing: boolean;
  elevated: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onCardClick?: () => void;
}

function SortableMotionItem({
  id,
  isJustAdded,
  link,
  isEditing,
  actionsDisabled,
  multipleLinks,
  listHovered,
  isDroppingTarget,
  isActiveDrag,
  anyEditing,
  elevated,
  onEdit,
  onDelete,
  onCardClick,
}: SortableMotionItemProps) {
  const {
    setNodeRef,
    transform,
    transition: dndTransition,
    isDragging,
    attributes,
    listeners,
  } = useSortable({ id });

  return (
    <motion.div
      ref={setNodeRef}
      initial={isJustAdded ? false : { height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      layout={isActiveDrag ? false : "position"}
      transition={{ duration: 0.2, ease: "easeInOut" }}
      style={{
        // overflow:visible when elevated so LinkCard's box-shadow isn't clipped
        overflow: elevated ? "visible" : "hidden",
        transform: CSS.Transform.toString(transform),
        transition: dndTransition ?? undefined,
      }}
    >
      <div className="pt-2.5">
        {isDragging || isDroppingTarget ? (
          <DropTarget />
        ) : (
          <LinkCard
            link={link}
            isPreview={isEditing}
            dimmed={anyEditing && !isEditing}
            elevated={elevated}
            actionsDisabled={actionsDisabled}
            multipleLinks={multipleLinks}
            listHovered={listHovered}
            dragListeners={listeners}
            dragAttributes={attributes}
            onEdit={onEdit}
            onDelete={onDelete}
            onCardClick={onCardClick}
          />
        )}
      </div>
    </motion.div>
  );
}

function SortablePreviewItem({
  link,
  multipleLinks,
  listHovered,
  isDroppingTarget,
}: {
  link: { url: string; title?: string | null };
  multipleLinks: boolean;
  listHovered: boolean;
  isDroppingTarget: boolean;
}) {
  const {
    setNodeRef,
    transform,
    transition: dndTransition,
    isDragging,
    attributes,
    listeners,
  } = useSortable({ id: PREVIEW_ID });

  return (
    <motion.div
      ref={setNodeRef}
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.2, ease: "easeInOut" }}
      style={{
        overflow: "hidden",
        transform: CSS.Transform.toString(transform),
        transition: dndTransition ?? undefined,
      }}
    >
      <div className="pt-2.5">
        {isDragging || isDroppingTarget ? (
          <DropTarget />
        ) : (
          <LinkCard
            link={link}
            isPreview
            actionsDisabled
            multipleLinks={multipleLinks}
            listHovered={listHovered}
            dragListeners={listeners}
            dragAttributes={attributes}
          />
        )}
      </div>
    </motion.div>
  );
}

/**
 * The links list, staged.
 *
 * Nothing here writes. Every add, edit, delete and drag edits a local draft
 * (see ~/hooks/useProfileLinks) and the page's save bar commits the lot. The
 * card that appears while a URL is being typed is not decoration any more —
 * it is a real entry in the list this component hands to `save`, which is why
 * a member can type a URL and press Save without pressing Add first.
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
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [listHovered, setListHovered] = useState(false);
  const [droppingId, setDroppingId] = useState<string | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  // sideEffects cleanup fires when the drop animation finishes — that's when we
  // reveal the real card again (until then, the slot stays as DropTarget).
  const dropAnimation = useMemo<DropAnimation>(
    () => ({
      duration: 250,
      easing: "ease",
      sideEffects: () => () => setDroppingId(null),
    }),
    [],
  );
  const justAddedIdRef = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const [mobileInputOpen, setMobileInputOpen] = useState(false);
  const [mobileEditSelectOpen, setMobileEditSelectOpen] = useState(false);
  const [titlePos, setTitlePos] = useState<{
    bottom: number;
    left: number;
    right: number;
  } | null>(null);
  // True while the overlay is mounted (including during its exit animation).
  // Keeps card elevation and z-index in sync with the overlay fade instead of snapping instantly.
  const mobileEditSelectPresent = mobileEditSelectOpen || titlePos !== null;

  useEffect(() => {
    if (mobileEditSelectOpen && listRef.current) {
      const rect = listRef.current.getBoundingClientRect();
      // bottom: position title just above the first card (accounting for pt-2.5 inside each item)
      setTitlePos({
        bottom: window.innerHeight - rect.top - 2,
        left: rect.left,
        right: window.innerWidth - rect.right,
      });
    }
    // titlePos is cleared by AnimatePresence.onExitComplete so it stays visible during the fade-out
  }, [mobileEditSelectOpen]);

  const handleMobileAddLink = useCallback(() => {
    setMobileInputOpen(true);
    requestAnimationFrame(() => urlInputRef.current?.focus());
  }, []);

  const handleMobileEditLinks = useCallback(() => {
    if (!listRef.current) {
      setMobileEditSelectOpen(true);
      return;
    }

    const rect = listRef.current.getBoundingClientRect();

    // Use CSS `top` + offsetHeight (both unaffected by translateY transforms) so that a
    // nav currently hidden by scroll detection is still counted — scrolling up reveals it
    // before the selection UI appears. Skip elements with `top: auto` (bottom drawers)
    // and anything taller than 1/3 of the viewport (full-screen overlays).
    const navBottom = Array.from(
      document.querySelectorAll<HTMLElement>(".sticky, .fixed"),
    ).reduce((max, el) => {
      const topStr = window.getComputedStyle(el).top;
      if (topStr === "auto") return max;
      if (el.offsetHeight >= window.innerHeight / 3) return max;
      return Math.max(max, parseFloat(topStr) + el.offsetHeight);
    }, 0);

    const titleClearance = navBottom + 40;

    if (rect.top < titleClearance || rect.bottom > window.innerHeight) {
      let opened = false;
      const open = () => {
        if (opened) return;
        opened = true;
        setMobileEditSelectOpen(true);
      };
      window.scrollBy({ top: rect.top - titleClearance, behavior: "smooth" });
      window.addEventListener("scrollend", open, { once: true });
      setTimeout(open, 800);
    } else {
      setMobileEditSelectOpen(true);
    }
  }, []);

  const urlIsValid = isValidLinkUrl(urlInput);
  const trimmedTitle = titleInput.trim();

  /**
   * The draft with the add-link box folded in — what is on screen, and what
   * `save` commits. While editing, the typed values replace that link in
   * place; otherwise a valid URL becomes a new card at `previewIndex`.
   */
  const stagedLinks = useMemo<DraftLink[]>(() => {
    if (!urlIsValid) return links;

    if (editingLinkId) {
      return links.map((l) =>
        l.id === editingLinkId
          ? { ...l, url: urlInput, title: trimmedTitle || null }
          : l,
      );
    }

    const insertAt = previewIndex ?? links.length;
    const left = links[insertAt - 1];
    const right = links[insertAt];
    const sortOrder =
      left === undefined
        ? (right?.sortOrder ?? 1) - 1
        : right === undefined
          ? left.sortOrder + 1
          : (left.sortOrder + right.sortOrder) / 2;

    return [
      ...links.slice(0, insertAt),
      {
        id: PREVIEW_ID,
        url: urlInput,
        title: trimmedTitle || null,
        sortOrder,
        isNew: true,
      },
      ...links.slice(insertAt),
    ];
  }, [links, editingLinkId, urlInput, trimmedTitle, urlIsValid, previewIndex]);

  const atMax = links.length >= PROFILE_LIMITS.linkCount;

  // A URL half-typed into the box is not in `stagedLinks`, so without this the
  // page-wide save would quietly drop it. Blocking the save is the honest
  // alternative: the message says what to do and the bar names the field.
  const pendingUrlError =
    urlInput.trim().length > 0 && !urlIsValid
      ? validateLinkUrl(urlInput)
      : null;
  const listError = validateLinks(stagedLinks);
  const error = listError ?? pendingUrlError;

  // The list-level message ("You can only add up to five links.") is about the
  // list, not about what is being typed, so it shows straight away. The URL
  // message waits for blur — nobody needs to be told a URL is invalid while
  // they are still on the third character of it.
  const blurred = useBlurredError(pendingUrlError);
  const visibleError = listError ?? blurred.error;

  const clearInput = useCallback(() => {
    setUrlInput("");
    setTitleInput("");
    setPreviewIndex(null);
    setEditingLinkId(null);
    setMobileInputOpen(false);
  }, []);

  /**
   * Moves whatever is in the add-link box into the draft and empties the box.
   * Local and instant — nothing is written. Returns the list to commit, which
   * differs from `stagedLinks` in one way that matters: the preview card's
   * placeholder id is swapped for the real draft id it was just given.
   *
   * Both callers need this. Pressing Add is the obvious one. The page-wide
   * save is the important one: a member who types a URL and reaches straight
   * for Save should not lose it, and folding the box in first means that if
   * the write fails the link is sitting in the list rather than in an input
   * that has since been cleared. It also keeps `PREVIEW_ID` out of the draft,
   * where it would collide with the next thing typed.
   */
  const materializePending = useCallback((): DraftLink[] => {
    if (editingLinkId) {
      if (urlIsValid) {
        updateLink(editingLinkId, urlInput, trimmedTitle || null);
      }
      clearInput();
      return stagedLinks;
    }

    const preview = stagedLinks.find((l) => l.id === PREVIEW_ID);
    if (!preview) {
      clearInput();
      return stagedLinks;
    }

    // The preview card is already on screen, so mark the new draft entry as
    // just-added: AnimatePresence should see a rename, not an exit and a birth.
    const realId = addLink(preview.url, preview.title, preview.sortOrder);
    justAddedIdRef.current = realId;
    clearInput();
    return stagedLinks.map((l) =>
      l.id === PREVIEW_ID ? { ...l, id: realId } : l,
    );
  }, [
    editingLinkId,
    urlIsValid,
    urlInput,
    trimmedTitle,
    stagedLinks,
    addLink,
    updateLink,
    clearInput,
  ]);

  const { isSaving } = useSettingsField({
    id: "links",
    label: "Links",
    isDirty: isDirtyFor(stagedLinks) || pendingUrlError !== null,
    error,
    save: () => save(materializePending()),
    reset: () => {
      reset();
      clearInput();
    },
  });

  const handleAdd = useCallback(() => {
    if (!urlIsValid) return;
    materializePending();
  }, [urlIsValid, materializePending]);

  const handleEdit = useCallback((link: DraftLink) => {
    setMobileEditSelectOpen(false);
    setEditingLinkId(link.id);
    setUrlInput(link.url);
    setTitleInput(link.title ?? "");
    requestAnimationFrame(() => titleInputRef.current?.focus());
  }, []);

  const handleMobileDelete = useCallback(() => {
    if (!editingLinkId) return;
    removeLink(editingLinkId);
    clearInput();
  }, [editingLinkId, removeLink, clearInput]);

  const recoverHover = useCallback(() => {
    // CSS :hover state may not re-fire after pointer capture releases on drag end.
    requestAnimationFrame(() =>
      setListHovered(listRef.current?.matches(":hover") ?? false),
    );
  }, []);

  // Keep a ref so handleDragEnd always reads the latest list without needing it
  // as a dep (updated after commit, not during render).
  const stagedLinksRef = useRef(stagedLinks);
  useEffect(() => {
    stagedLinksRef.current = stagedLinks;
  });

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);
      setDroppingId(active.id as string);
      recoverHover();
      if (!over || active.id === over.id) return;

      const current = stagedLinksRef.current;
      const fromIndex = current.findIndex((l) => l.id === active.id);
      const toIndex = current.findIndex((l) => l.id === over.id);
      if (fromIndex === -1 || toIndex === -1) return;

      const newOrder = arrayMove(current, fromIndex, toIndex);

      // Keep previewIndex in sync whenever the preview shifts position
      const newPreviewIdx = newOrder.findIndex((l) => l.id === PREVIEW_ID);
      if (newPreviewIdx !== -1) {
        setPreviewIndex(
          newOrder.slice(0, newPreviewIdx).filter((l) => l.id !== PREVIEW_ID)
            .length,
        );
      }

      if (active.id === PREVIEW_ID) return;

      // Compute sortOrder from real-link neighbors only
      const realLinks = newOrder.filter((l) => l.id !== PREVIEW_ID);
      const newToIndex = realLinks.findIndex((l) => l.id === active.id);
      const left = realLinks[newToIndex - 1];
      const right = realLinks[newToIndex + 1];
      const newSortOrder =
        left === undefined
          ? (right?.sortOrder ?? 1) - 1
          : right === undefined
            ? left.sortOrder + 1
            : (left.sortOrder + right.sortOrder) / 2;

      reorderLink(active.id as string, newSortOrder);
    },
    [reorderLink, recoverHover],
  );

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const multipleItems = stagedLinks.length > 1;
  const sortableItems = stagedLinks.map((l) => l.id);
  const activeLink = stagedLinks.find((l) => l.id === activeId) ?? null;
  const inputDisabled = isSaving || (!editingLinkId && atMax);
  const previewPresent = stagedLinks.some((l) => l.id === PREVIEW_ID);

  return (
    <div onBlur={blurred.onBlur}>
      <div className="flex flex-col gap-2.5">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={(e) => setActiveId(e.active.id as string)}
          onDragEnd={handleDragEnd}
          onDragCancel={(e) => {
            setDroppingId(e.active.id as string);
            setActiveId(null);
            recoverHover();
          }}
        >
          <div
            ref={listRef}
            className={`flex flex-col not-empty:-mt-2.5 ${mobileEditSelectPresent ? "relative z-90" : ""}`}
            onMouseEnter={() => setListHovered(true)}
            onMouseLeave={() => setListHovered(false)}
          >
            <SortableContext
              items={sortableItems}
              strategy={verticalListSortingStrategy}
              disabled={sortableItems.length <= 1 || isSaving}
            >
              <AnimatePresence initial={false}>
                {/* eslint-disable-next-line react-hooks/refs -- consume-once entrance-animation flag (read/cleared during render) */}
                {stagedLinks.map((link) => {
                  if (link.id === PREVIEW_ID) {
                    return (
                      <SortablePreviewItem
                        key={link.id}
                        link={link}
                        multipleLinks={multipleItems}
                        listHovered={listHovered}
                        isDroppingTarget={link.id === droppingId}
                      />
                    );
                  }

                  // Consume-once animation flag: this newly added link animates
                  // in on its first render only, so we read and clear the ref
                  // here during render (a deliberate imperative one-shot).
                  const isJustAdded = justAddedIdRef.current === link.id;
                  if (isJustAdded) justAddedIdRef.current = null;

                  return (
                    <SortableMotionItem
                      key={link.id}
                      id={link.id}
                      isJustAdded={isJustAdded}
                      link={link}
                      isEditing={link.id === editingLinkId}
                      actionsDisabled={
                        !!editingLinkId || previewPresent || isSaving
                      }
                      multipleLinks={multipleItems}
                      listHovered={listHovered}
                      isDroppingTarget={link.id === droppingId}
                      isActiveDrag={activeId !== null || droppingId !== null}
                      anyEditing={!!editingLinkId || previewPresent}
                      elevated={mobileEditSelectPresent}
                      onEdit={() => handleEdit(link)}
                      onDelete={() => removeLink(link.id)}
                      onCardClick={
                        mobileEditSelectOpen
                          ? () => handleEdit(link)
                          : undefined
                      }
                    />
                  );
                })}
              </AnimatePresence>
            </SortableContext>
          </div>

          <DragOverlay dropAnimation={dropAnimation}>
            {activeLink ? (
              <div className="drop-shadow-xl">
                <LinkCard
                  link={activeLink}
                  multipleLinks
                  listHovered
                  isGrabbing
                  isPreview={activeId === PREVIEW_ID}
                  actionsDisabled={activeId === PREVIEW_ID}
                />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>

        {/* Mobile-only buttons + helper text — wrapper stays elevated above overlay in
            selection mode so neither element causes a layout shift when mode opens. */}
        <div className="flex flex-col gap-2.5">
          <AnimatePresence>
            {!mobileInputOpen && !editingLinkId && (
              <motion.div
                key="mobile-buttons"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
                className="overflow-hidden md:hidden"
              >
                <div className="flex gap-2">
                  {!atMax && (
                    <button
                      type="button"
                      onClick={handleMobileAddLink}
                      className="flex shrink-0 items-center gap-[1ch] rounded-sm border-2 border-white bg-white px-4 py-1.5 text-sm font-medium text-black transition outline-none hover:bg-transparent hover:text-white hover:shadow-sm hover:shadow-white/10 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
                    >
                      <PlusIcon size={14} />
                      Add Link
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleMobileEditLinks}
                    className="flex items-center gap-[1ch] rounded-sm border border-mauve-700 bg-mauve-800 px-4 py-1.5 text-sm font-medium text-mauve-300 inset-ring-mauve-600 transition-colors outline-none hover:border-mauve-500 hover:bg-mauve-700 hover:text-white hover:inset-ring-1 focus-visible:ring-2 focus-visible:ring-mauve-400 focus-visible:ring-offset-2"
                  >
                    <PencilSimpleIcon size={14} />
                    Edit Links
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <p className="text-xs text-mauve-500">
            {editingLinkId
              ? "Editing link…"
              : atMax
                ? `You can't add more than ${PROFILE_LIMITS.linkCount} links.`
                : `${links.length} of ${PROFILE_LIMITS.linkCount} links used. Add another below.`}
          </p>
        </div>

        {(!atMax || editingLinkId) && (
          <div
            className={
              !mobileInputOpen && !editingLinkId ? "hidden md:block" : ""
            }
          >
            <AddLinkInput
              id={urlInputId}
              urlValue={urlInput}
              onUrlChange={(v) => {
                setUrlInput(v);
                if (!isValidLinkUrl(v)) setPreviewIndex(null);
              }}
              titleValue={titleInput}
              onTitleChange={setTitleInput}
              onSubmit={handleAdd}
              submitLabel={editingLinkId ? "Apply" : "Add"}
              canSubmit={urlIsValid && !isSaving}
              disabled={inputDisabled}
              titleInputRef={titleInputRef}
              urlInputRef={urlInputRef}
            />
          </div>
        )}

        {editingLinkId && (
          <button
            type="button"
            onClick={handleMobileDelete}
            disabled={isSaving}
            aria-label="Delete link"
            className="flex w-fit items-center gap-[1ch] rounded-sm border-2 border-rose-700 bg-rose-700 px-4 py-1.5 text-sm font-medium text-white transition outline-none focus-visible:ring-2 focus-visible:ring-rose-700 focus-visible:ring-offset-2 enabled:hover:bg-rose-50 enabled:hover:text-rose-700 enabled:hover:shadow-sm enabled:hover:shadow-rose-700/15 disabled:cursor-not-allowed disabled:opacity-50 md:hidden"
          >
            Delete
          </button>
        )}

        <FieldError error={visibleError} />
      </div>

      {/* Full-screen overlay + title — portalled to body to escape any parent stacking context */}
      {createPortal(
        <AnimatePresence onExitComplete={() => setTitlePos(null)}>
          {mobileEditSelectOpen && (
            <motion.div
              key="mobile-edit-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <RemoveScroll>
                <div
                  className="fixed inset-0 z-80 bg-black/60 backdrop-blur-xs md:hidden"
                  onClick={() => setMobileEditSelectOpen(false)}
                  aria-hidden="true"
                />
                {titlePos && (
                  <p
                    style={{
                      bottom: titlePos.bottom,
                      left: titlePos.left,
                      right: titlePos.right,
                    }}
                    className="text-shadow-block-sm pointer-events-none fixed z-90 pb-2 text-lg font-bold text-white text-shadow-black md:hidden"
                  >
                    Select a link to edit
                  </p>
                )}
              </RemoveScroll>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}
