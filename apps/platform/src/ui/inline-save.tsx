"use client";

import { motion } from "motion/react";
import { useState, type ReactNode } from "react";
import { SpinnerGapIcon, ArrowCounterClockwiseIcon } from "@phosphor-icons/react/ssr";

interface InlineSaveProps {
  show: boolean;
  isPending: boolean;
  onSave: () => void;
  onReset?: () => void;
  children?: ReactNode;
  label?: ReactNode;
  meta?: ReactNode;
  secondaryMeta?: ReactNode;
  left?: ReactNode;
  disabled?: boolean;
  focused?: boolean;
}

// Animated "⌘ S" / "Ctrl S" hint shown inside the save button while the
// paired input is focused.
function ShortcutHint({ show }: { show: boolean }) {
  const [isMac] = useState(
    () =>
      typeof navigator !== "undefined" &&
      /Mac|iPhone|iPad|iPod/.test(navigator.userAgent),
  );

  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 overflow-hidden transition-[grid-template-columns] duration-200 ease-in-out ${
        show ? "grid-cols-[1fr]" : "grid-cols-[0fr]"
      }`}
    >
      <span
        className={`mt-px ml-[1ch] flex items-center gap-0.5 overflow-hidden transition-opacity duration-200 ease-in-out ${
          show ? "opacity-100" : "opacity-0"
        }`}
      >
        <kbd className="rounded-sm border border-b-2 border-current/20 bg-current/10 px-1 font-mono text-[0.6875rem] font-normal whitespace-nowrap">
          {isMac ? "⌘" : "Ctrl"}
        </kbd>
        <kbd className="rounded-sm border border-b-2 border-current/20 bg-current/10 px-1 font-mono text-[0.6875rem] font-normal whitespace-nowrap">
          S
        </kbd>
      </span>
    </span>
  );
}

function SaveButtons({
  isPending,
  disabled,
  onSave,
  onReset,
  children,
  hintVisible,
}: Omit<InlineSaveProps, "label" | "show"> & { hintVisible: boolean }) {
  return (
    <>
      {onReset && (
        <button
          type="button"
          onClick={onReset}
          disabled={isPending}
          aria-label="Reset"
          className="flex shrink-0 items-center justify-center self-stretch rounded-sm border border-mauve-700 bg-mauve-800 px-2.5 text-mauve-300 inset-ring-mauve-600 transition-colors outline-none hover:border-mauve-500 hover:bg-mauve-700 hover:text-white hover:inset-ring-1 focus-visible:ring-2 focus-visible:ring-mauve-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
        >
          <ArrowCounterClockwiseIcon size={14} />
        </button>
      )}
      <button
        type="button"
        onClick={onSave}
        disabled={isPending || disabled}
        className="relative flex items-center justify-center rounded-sm border-2 border-white bg-white px-4 py-1.5 text-sm font-medium text-black transition outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 enabled:hover:bg-transparent enabled:hover:text-white enabled:hover:shadow-sm enabled:hover:shadow-white/10 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? (
          <SpinnerGapIcon className="animate-spin [animation-duration:750ms]" />
        ) : (
          <>
            {children ?? "Save"}
            <ShortcutHint show={hintVisible} />
          </>
        )}
      </button>
    </>
  );
}

export default function InlineSave({
  show,
  isPending,
  disabled,
  onSave,
  onReset,
  children,
  label,
  meta,
  secondaryMeta,
  left,
  focused,
}: InlineSaveProps) {
  const hintVisible = !!focused && show && !disabled && !isPending;

  if (label !== undefined) {
    return (
      <div className="flex max-w-sm items-start gap-2 pt-2.5">
        <span className="flex-1 text-xs text-mauve-500">{label}</span>
        <div
          className={`grid overflow-hidden transition-[grid-template-columns] duration-200 ease-in-out ${
            show ? "grid-cols-[1fr]" : "grid-cols-[0fr]"
          }`}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <SaveButtons
                isPending={isPending}
                disabled={disabled}
                onSave={onSave}
                onReset={onReset}
                hintVisible={hintVisible}
              >
                {children}
              </SaveButtons>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`grid transition-[grid-template-rows] duration-200 ease-in-out ${
        show ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
      }`}
    >
      <div className="flex min-h-0 flex-col justify-end overflow-hidden">
        <div className="flex max-w-sm items-center justify-between gap-2 pt-2.5 text-xs leading-tight text-balance text-mauve-600">
          {left}
          {(meta || secondaryMeta !== undefined) && (
            <div className="flex flex-col *:h-lh *:truncate *:transition-[height] *:data-hidden:h-0">
              <span data-hidden={!meta || undefined}>{meta}</span>
              <span data-hidden={!secondaryMeta || undefined}>
                {secondaryMeta}
              </span>
            </div>
          )}
          <div className="ml-auto flex items-center gap-2">
            <SaveButtons
              isPending={isPending}
              disabled={disabled}
              onSave={onSave}
              onReset={onReset}
              hintVisible={hintVisible}
            >
              {children}
            </SaveButtons>
          </div>
        </div>
      </div>
    </div>
  );
}
