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
import { useProfileLinks } from "~/hooks/useProfileLinks";
import { useSaveShortcut } from "~/hooks/useSaveShortcut";
import { useUnsavedChangesWarning } from "~/hooks/useUnsavedChangesWarning";
import type { profileLinks } from '~/server/db/schema';
import DropTarget from "~/ui/drop-target";
import InlineSave from "~/ui/inline-save";
import LinkCard from "./LinkCard";
import { isValidLinkUrl } from "./LinkCard";
import AddLinkInput from "./AddLinkInput";

const PREVIEW_ID = "__preview__";

interface Props {
  initialLinks: (typeof profileLinks.$inferSelect)[];
}

// LinkCard is now in ./LinkCard.tsx
// Merges dnd-kit's sortable ref + transform with Framer Motion's height/opacity animation.
// setNodeRef must be on the motion.div (not a child) so the entire clipped box moves as a
// unit during sorting — applying the transform inside an overflow:hidden parent would clip it.
interface SortableMotionItemProps {
  id: string;
  isJustAdded: boolean;
  link: typeof profileLinks.$inferSelect;
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
  pendingSubmit,
}: {
  link: { url: string; title?: string | null };
  multipleLinks: boolean;
  listHovered: boolean;
  isDroppingTarget: boolean;
  pendingSubmit: boolean;
}) {
  const {
    setNodeRef,
    transform,
    transition: dndTransition,
    isDragging,
    attributes,
    listeners,
  } = useSortable({ id: PREVIEW_ID, disabled: pendingSubmit });

  return (
    <motion.div
      ref={setNodeRef}
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={
        pendingSubmit
          ? { height: "auto", opacity: 1, transition: { duration: 0 } }
          : { height: 0, opacity: 0 }
      }
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
            multipleLinks={multipleLinks && !pendingSubmit}
            listHovered={listHovered}
            dragListeners={listeners}
            dragAttributes={attributes}
          />
        )}
      </div>
    </motion.div>
  );
}

export default function ProfileLinks({ initialLinks }: Props) {
  const urlInputId = useId();
  const {
    links,
    error,
    hasPendingStructural,
    addLink,
    removeLink,
    updateLink,
    reorderLink,
    saveStructuralChanges,
    cancelStructuralChanges,
    isAddingLink,
    isUpdatingLink,
    isSavingStructural,
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
  const [pendingSubmit, setPendingSubmit] = useState<{
    url: string;
    title: string | null;
  } | null>(null);
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

  const atMax = links.length >= 5;
  const urlIsValid = isValidLinkUrl(urlInput);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Preview data: frozen submitted values while mutation is pending, else live input values
  const previewData =
    pendingSubmit ??
    (urlIsValid && !editingLinkId
      ? { url: urlInput, title: titleInput || null }
      : null);

  // Insert the preview card at previewIndex (or end by default)
  const effectivePreviewIndex = previewIndex ?? links.length;
  const previewItem = previewData
    ? ({
        id: PREVIEW_ID,
        url: previewData.url,
        title: previewData.title,
        sortOrder: Infinity,
        createdAt: null as unknown as Date,
        userId: "",
        _isPreview: true as const,
      } as const)
    : null;

  const displayLinks = [
    ...links
      .slice(0, effectivePreviewIndex)
      .map((l) => ({ ...l, _isPreview: false as const })),
    ...(previewItem ? [previewItem] : []),
    ...links
      .slice(effectivePreviewIndex)
      .map((l) => ({ ...l, _isPreview: false as const })),
  ];

  // Keep a ref so handleDragEnd always reads the latest list without needing it as a dep
  const displayLinksRef = useRef(displayLinks);
  displayLinksRef.current = displayLinks;

  const multipleItems = displayLinks.length > 1;
  // Exclude preview from sortable items while submission is pending (frozen state)
  const sortableItems = [
    ...links.slice(0, effectivePreviewIndex).map((l) => l.id),
    ...(previewItem && !pendingSubmit ? [PREVIEW_ID] : []),
    ...links.slice(effectivePreviewIndex).map((l) => l.id),
  ];
  const activeLink =
    activeId === PREVIEW_ID
      ? previewData
      : (links.find((l) => l.id === activeId) ?? null);

  const handleEdit = useCallback((link: typeof profileLinks.$inferSelect) => {
    setMobileEditSelectOpen(false);
    setEditingLinkId(link.id);
    setUrlInput(link.url);
    setTitleInput(link.title ?? "");
    requestAnimationFrame(() => titleInputRef.current?.focus());
  }, []);

  const handleMobileDelete = useCallback(() => {
    if (!editingLinkId) return;
    removeLink(editingLinkId);
    setEditingLinkId(null);
    setUrlInput("");
    setTitleInput("");
  }, [editingLinkId, removeLink]);

  const handleSave = useCallback(() => {
    if (editingLinkId) {
      updateLink(editingLinkId, urlInput, titleInput.trim() || undefined);
      if (hasPendingStructural) saveStructuralChanges(links);
      setEditingLinkId(null);
      setUrlInput("");
      setTitleInput("");
    } else if (urlIsValid) {
      const url = urlInput;
      const title = titleInput.trim() || undefined;
      setPendingSubmit({ url, title: title ?? null });
      setUrlInput("");
      setTitleInput("");

      const insertAt = previewIndex ?? links.length;
      const left = links[insertAt - 1];
      const right = links[insertAt];
      const sortOrder =
        left === undefined
          ? (right?.sortOrder ?? 1) - 1
          : right === undefined
            ? (left.sortOrder ?? 0) + 1
            : ((left.sortOrder ?? 0) + (right.sortOrder ?? 0)) / 2;

      addLink(
        url,
        title,
        sortOrder,
        (link: typeof profileLinks.$inferSelect) => {
          justAddedIdRef.current = link.id;
          setPendingSubmit(null);
          setPreviewIndex(null);
          setMobileInputOpen(false);
        },
        () => {
          setPendingSubmit(null);
          setMobileInputOpen(false);
        },
      );
      if (hasPendingStructural) saveStructuralChanges(links);
    } else {
      saveStructuralChanges(links);
    }
  }, [
    editingLinkId,
    urlInput,
    urlIsValid,
    titleInput,
    previewIndex,
    links,
    updateLink,
    addLink,
    hasPendingStructural,
    saveStructuralChanges,
  ]);

  const handleReset = useCallback(() => {
    if (editingLinkId) {
      setEditingLinkId(null);
      setUrlInput("");
      setTitleInput("");
    } else if (urlInput !== "") {
      setUrlInput("");
      setTitleInput("");
      setPreviewIndex(null);
      setMobileInputOpen(false);
    } else {
      setPreviewIndex(null);
      cancelStructuralChanges();
      setMobileInputOpen(false);
    }
  }, [editingLinkId, urlInput, cancelStructuralChanges]);

  const recoverHover = useCallback(() => {
    // CSS :hover state may not re-fire after pointer capture releases on drag end.
    requestAnimationFrame(() =>
      setListHovered(listRef.current?.matches(":hover") ?? false),
    );
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);
      setDroppingId(active.id as string);
      recoverHover();
      if (!over || active.id === over.id) return;

      const current = displayLinksRef.current;
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
            ? (left.sortOrder ?? 0) + 1
            : ((left.sortOrder ?? 0) + (right.sortOrder ?? 0)) / 2;

      reorderLink(active.id as string, newSortOrder);
    },
    [reorderLink, recoverHover],
  );

  useUnsavedChangesWarning(
    !!(urlInput !== "" || !!editingLinkId || hasPendingStructural),
  );

  const inputDisabled = editingLinkId
    ? isUpdatingLink
    : pendingSubmit !== null || atMax || isAddingLink;
  const saveShow =
    urlIsValid && !pendingSubmit && (editingLinkId ? true : !atMax);
  const isSaving = isAddingLink || isUpdatingLink || !!isSavingStructural;
  const saveDisabled = !saveShow && !hasPendingStructural;
  const shortcut = useSaveShortcut(handleSave, !saveDisabled && !isSaving);

  return (
    <div onFocus={shortcut.onFocus} onBlur={shortcut.onBlur}>
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
              disabled={sortableItems.length <= 1}
            >
              <AnimatePresence initial={false}>
                {displayLinks.map((link) => {
                  if (link._isPreview) {
                    return (
                      <SortablePreviewItem
                        key={link.id}
                        link={link}
                        multipleLinks={multipleItems}
                        listHovered={listHovered}
                        isDroppingTarget={link.id === droppingId}
                        pendingSubmit={pendingSubmit !== null}
                      />
                    );
                  }

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
                        !!editingLinkId || !!previewData || !!isSavingStructural
                      }
                      multipleLinks={multipleItems}
                      listHovered={listHovered}
                      isDroppingTarget={link.id === droppingId}
                      isActiveDrag={activeId !== null || droppingId !== null}
                      anyEditing={!!editingLinkId || !!previewData}
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
                ? "You can't add more than five links."
                : `${links.length} of 5 links used. Add another below.`}
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
              onSubmit={handleSave}
              disabled={inputDisabled}
              titleInputRef={titleInputRef}
              urlInputRef={urlInputRef}
            />
          </div>
        )}
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

      <InlineSave
        show={
          saveShow ||
          !!hasPendingStructural ||
          (mobileInputOpen && !editingLinkId)
        }
        disabled={saveDisabled}
        isPending={isSaving}
        onSave={handleSave}
        onReset={handleReset}
        focused={shortcut.focused}
        left={
          editingLinkId ? (
            <button
              type="button"
              onClick={handleMobileDelete}
              disabled={isUpdatingLink}
              aria-label="Delete link"
              className="flex items-center gap-[1ch] rounded-sm border-2 border-rose-700 bg-rose-700 px-4 py-1.5 text-sm font-medium text-white transition outline-none focus-visible:ring-2 focus-visible:ring-rose-700 focus-visible:ring-offset-2 enabled:hover:bg-rose-50 enabled:hover:text-rose-700 enabled:hover:shadow-sm enabled:hover:shadow-rose-700/15 disabled:cursor-not-allowed disabled:opacity-50 md:hidden"
            >
              Delete
            </button>
          ) : undefined
        }
      >
        Save
      </InlineSave>
    </div>
  );
}
