"use client";

import { CaretDownIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import DocsProjectMark from "~/components/DocsProjectMark";
import { groupDocsProjects } from "~/config/docs";

/** One docs project, as listed in the navbar menu. */
export interface DocsProjectLink {
  slug: string;
  name: string;
  description: string | null;
}

interface Props {
  href: string;
  label: string;
  active: boolean;
  /** Slug of the project being read right now, if any. */
  activeSlug: string | null;
  projects: DocsProjectLink[];
  className: string;
}

/**
 * The Docs navbar entry: still a plain link to /docs, with a menu of the
 * individual projects that opens on hover, or on keyboard focus, where the
 * projects are simply the next tab stops. Radix's DropdownMenu is not used
 * here because its trigger swallows Enter to toggle the menu, which would take
 * the link's own destination away from keyboard users.
 */
export default function DocsMenu({
  href,
  label,
  active,
  activeSlug,
  projects,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const groups = useMemo(() => groupDocsProjects(projects), [projects]);
  const triggerRef = useRef<HTMLAnchorElement>(null);

  // Two containers rather than one grid with per-item column placement: a
  // single grid sizes each ROW to its tallest cell, so the short left-hand
  // groups would each be followed by a band of whitespace as tall as Apps.
  // Separate columns let each side stack at its own height.
  const leftGroups = groups.filter((group) => group.column === "left");
  const rightGroups = groups.filter((group) => group.column === "right");

  // A render function, not a component: called inline it produces the same
  // element tree React would diff anyway, where a component declared here
  // would be a new type on every render and remount the whole column.
  //
  // A plain group + label rather than a role="menu" tree — these are links the
  // tab order already walks in order, and calling them menuitems would promise
  // arrow-key navigation the trigger deliberately does not implement.
  function renderGroup(group: (typeof groups)[number]) {
    return (
      <div key={group.id} role="group" aria-label={group.label}>
        <p className="px-2.5 pt-2 pb-1 text-xs font-semibold tracking-wide text-mauve-500 uppercase">
          {group.label}
        </p>
        {group.projects.map((project) => (
          <Link
            key={project.slug}
            href={`/docs/${encodeURIComponent(project.slug)}`}
            aria-current={project.slug === activeSlug ? "page" : undefined}
            onClick={() => setOpen(false)}
            className="flex items-start gap-2.5 rounded-md px-2.5 py-2 transition-colors outline-none hover:bg-mauve-800 focus-visible:bg-mauve-800 aria-[current=page]:bg-mauve-800/60"
          >
            <DocsProjectMark slug={project.slug} />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm font-medium text-white">
                {project.name}
              </span>
              {project.description && (
                <span className="text-xs/relaxed text-mauve-400">
                  {project.description}
                </span>
              )}
            </span>
          </Link>
        ))}
      </div>
    );
  }
  // Escape hands focus back to the trigger, and focus is what opens the menu —
  // so it stays dismissed until the pointer or focus leaves and comes back.
  const dismissed = useRef(false);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      dismissed.current = true;
      setOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <div
      className="relative"
      // A touch tap fires pointerenter too, where the menu would cover the
      // page the tap just navigated to.
      onPointerEnter={(event) => {
        if (event.pointerType === "touch") return;
        dismissed.current = false;
        setOpen(true);
      }}
      onPointerLeave={() => {
        dismissed.current = false;
        setOpen(false);
      }}
      onFocus={() => {
        if (!dismissed.current) setOpen(true);
      }}
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return;
        dismissed.current = false;
        setOpen(false);
      }}
    >
      <Link
        ref={triggerRef}
        href={href}
        aria-haspopup="menu"
        aria-expanded={open}
        data-active={active || undefined}
        className={`${className} flex items-center gap-2`}
      >
        {label}
        <CaretDownIcon aria-hidden className="size-3.5" />
      </Link>

      {/* The padding bridges the gap under the navbar so the pointer can
          travel from the trigger into the menu without closing it. */}
      {open && (
        <div className="absolute top-full left-0 pt-2">
          {/* Two columns from `lg`, not from `md`. The nav itself appears at
              `md`, but this panel is anchored to its trigger with `left-0`, and
              at 768px a 36rem panel opening from a trigger that sits well into
              the bar would run off the right of the viewport. Below `lg` it
              stays the single 20rem column it was. */}
          <div className="animate-in fade-in-0 zoom-in-95 slide-in-from-top-1 w-80 origin-top rounded-lg border border-mauve-800 bg-mauve-950 p-1 shadow-lg duration-150 ease-out lg:grid lg:w-[36rem] lg:grid-cols-2 lg:items-start lg:gap-x-1">
            {/* Below `lg` this is one column and the two halves stack, so the
                left-hand groups come first and Apps follows. Reading order
                stays sensible; only the side-by-side arrangement is lost. */}
            <div>{leftGroups.map(renderGroup)}</div>
            <div>{rightGroups.map(renderGroup)}</div>
          </div>
        </div>
      )}
    </div>
  );
}
