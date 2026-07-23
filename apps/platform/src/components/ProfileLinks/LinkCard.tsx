"use client";

import {
  DotsSixVerticalIcon,
  PencilSimpleIcon,
  TrashIcon,
} from "@phosphor-icons/react/ssr";
import type { useSortable } from "@dnd-kit/sortable";

function faviconUrl(url: string): string {
  try {
    const { hostname } = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`;
  } catch {
    return "";
  }
}

export function isValidLinkUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

export interface LinkCardProps {
  link: { url: string; title?: string | null };
  isPreview?: boolean;
  dimmed?: boolean;
  elevated?: boolean;
  actionsDisabled?: boolean;
  multipleLinks?: boolean;
  listHovered?: boolean;
  isGrabbing?: boolean;
  dragListeners?: ReturnType<typeof useSortable>["listeners"];
  dragAttributes?: ReturnType<typeof useSortable>["attributes"];
  onEdit?: () => void;
  onDelete?: () => void;
  onCardClick?: () => void;
}

export default function LinkCard({
  link,
  isPreview,
  dimmed,
  elevated,
  actionsDisabled,
  multipleLinks,
  listHovered,
  isGrabbing,
  dragListeners,
  dragAttributes,
  onEdit,
  onDelete,
  onCardClick,
}: LinkCardProps) {
  const favicon = faviconUrl(link.url);
  const displayTitle =
    link.title ??
    (isValidLinkUrl(link.url) ? new URL(link.url).hostname : link.url);
  const handleVisible = dimmed
    ? false
    : isPreview
      ? !!multipleLinks
      : (isGrabbing ?? (!!listHovered && !!multipleLinks));

  return (
    <div
      className={`group/card relative flex max-w-lg gap-2 overflow-hidden rounded-sm border-2 px-4 py-3 transition-[border-color,background-color,opacity,box-shadow,transform] duration-300 md:min-h-17 md:p-2 ${
        isPreview
          ? `border-transparent bg-mauve-800${multipleLinks ? "md:cursor-grab md:active:cursor-grabbing" : ""}`
          : dimmed
            ? "border-mauve-700 bg-mauve-800"
            : "border-mauve-600 bg-mauve-800"
      } ${dimmed ? "opacity-50" : ""} ${
        elevated
          ? "-translate-x-0.5 -translate-y-0.5 [box-shadow:3px_3px_0_0_black,0_10px_20px_rgba(0,0,0,0.15)]"
          : ""
      }`}
      {...(isPreview && multipleLinks ? dragListeners : undefined)}
      {...(isPreview && multipleLinks ? dragAttributes : undefined)}
    >
      {isPreview && (
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          aria-hidden="true"
        >
          <rect
            x="1"
            y="1"
            width="calc(100% - 2px)"
            height="calc(100% - 2px)"
            rx="3"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="animate-march-dashes text-mauve-400"
          />
        </svg>
      )}

      <div
        className={`order-last shrink-0 overflow-hidden transition-[width,margin,opacity] duration-200 has-focus-visible:-my-2 has-focus-visible:-mr-2 has-focus-visible:w-10 has-focus-visible:opacity-100 md:order-0 md:has-focus-visible:mr-0 md:has-focus-visible:-ml-2 md:has-focus-visible:w-8 ${
          handleVisible
            ? "-my-2 -mr-2 w-10 opacity-100 md:mr-0 md:-ml-2 md:w-8"
            : "w-0 opacity-0"
        }`}
      >
        <button
          type="button"
          {...(!isPreview ? dragListeners : undefined)}
          {...(!isPreview ? dragAttributes : undefined)}
          disabled={!multipleLinks}
          aria-label="Drag to reorder"
          tabIndex={isPreview ? -1 : multipleLinks ? 0 : -1}
          className={`flex h-full items-center justify-center p-2 text-mauve-500 transition-colors disabled:pointer-events-none disabled:opacity-20 ${
            isGrabbing
              ? "md:cursor-grabbing md:bg-white/10 md:text-white"
              : "md:cursor-grab md:hover:bg-white/10 md:hover:text-white md:active:cursor-grabbing"
          }`}
        >
          <DotsSixVerticalIcon className="size-4.5 shrink-0 md:size-4" />
        </button>
      </div>

      <p className="flex w-full flex-col gap-1.25 self-center overflow-hidden">
        <span className="flex items-center gap-2.5">
          {favicon && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={favicon}
              alt=""
              width={16}
              height={16}
              className="mt-px shrink-0 rounded-sm"
            />
          )}
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">
            {displayTitle}
          </span>
        </span>
        <a
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          tabIndex={isPreview ? -1 : undefined}
          className="ml-px truncate font-mono text-xs text-mauve-400 hover:text-mauve-200 hover:underline"
        >
          {link.url}
        </a>
      </p>

      {!isPreview && !actionsDisabled && onEdit && onDelete && (
        <div className="ml-auto hidden shrink-0 translate-x-4 flex-col items-end justify-between gap-1 opacity-0 transition-[translate,opacity] delay-200 duration-200 group-focus-within/card:translate-x-0 group-focus-within/card:opacity-100 group-hover/card:translate-x-0 group-hover/card:opacity-100 hover:delay-0 md:flex">
          <button
            type="button"
            onClick={onEdit}
            disabled={actionsDisabled}
            aria-label="Edit link"
            className="group/btn hover:shadow-block-sm flex min-w-5.5 items-center rounded-full border border-mauve-600 bg-mauve-700 px-1 py-0.5 text-mauve-200 shadow-mauve-950 transition-shadow hover:bg-mauve-600 hover:px-2 hover:text-white disabled:pointer-events-none disabled:opacity-30"
          >
            <PencilSimpleIcon size={13} className="shrink-0" />
            <span className="max-w-0 overflow-hidden text-xs whitespace-nowrap transition-[max-width] duration-150 group-hover/btn:max-w-10 group-hover/btn:pl-1.5">
              Edit
            </span>
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={actionsDisabled}
            aria-label="Delete link"
            className="group/btn hover:shadow-block-sm flex min-w-5.5 items-center rounded-full border border-rose-900 bg-mauve-700 px-1 py-0.5 text-rose-400 shadow-rose-950 transition-shadow hover:bg-rose-950 hover:px-2 hover:text-rose-300 disabled:pointer-events-none disabled:opacity-30"
          >
            <TrashIcon size={13} className="shrink-0" />
            <span className="max-w-0 overflow-hidden text-xs whitespace-nowrap transition-[max-width] duration-150 group-hover/btn:max-w-10 group-hover/btn:pl-1.5">
              Delete
            </span>
          </button>
        </div>
      )}

      {onCardClick && (
        <button
          type="button"
          onClick={onCardClick}
          aria-label={`Edit ${link.title ?? link.url}`}
          className="absolute inset-0 cursor-pointer rounded-sm"
        />
      )}
    </div>
  );
}
