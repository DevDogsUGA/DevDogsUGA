"use client";

import * as Dialog from "@radix-ui/react-dialog";
import type { CSSProperties, ReactNode } from "react";
import type { DialogTheme } from "./theme";

/**
 * Chrome shared by <FeedbackDialog> and <ReportDialog>.
 *
 * They are the same dialog with different fields, so the overlay, header,
 * theming, part-name vocabulary and pending-state behaviour live here once. An
 * app that themes one gets the other for free, which matters because both will
 * usually appear in the same product.
 */

/** Every themable/overridable element, for the `classNames` prop. */
export type DialogPart =
  | "overlay"
  | "content"
  | "header"
  | "title"
  | "closeButton"
  | "body"
  | "field"
  | "label"
  | "select"
  | "input"
  | "textarea"
  | "hint"
  | "error"
  | "banner"
  | "success"
  | "footer"
  | "cancelButton"
  | "submitButton";

export type DialogClassNames = Partial<Record<DialogPart, string>>;

const THEME_VAR_NAMES: Record<keyof DialogTheme, string> = {
  accent: "--dd-accent",
  accentForeground: "--dd-accent-foreground",
  background: "--dd-background",
  foreground: "--dd-foreground",
  muted: "--dd-muted",
  border: "--dd-border",
  radius: "--dd-radius",
  fontFamily: "--dd-font-family",
};

export function themeToStyle(
  theme: Partial<DialogTheme> | undefined,
): CSSProperties {
  if (!theme) return {};
  const style: Record<string, string> = {};
  for (const [key, value] of Object.entries(theme)) {
    if (value === undefined) continue;
    style[THEME_VAR_NAMES[key as keyof DialogTheme]] = value;
  }
  return style;
}

/** Merges a caller's per-part override onto the shipped default class. */
export function classNameFor(classNames: DialogClassNames) {
  return (part: DialogPart, base: string) =>
    classNames[part] ? `${base} ${classNames[part]}` : base;
}

export interface DialogShellProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Blocks close-on-escape and close-on-outside-click while submitting. */
  isPending: boolean;
  theme?: Partial<DialogTheme>;
  classNames?: DialogClassNames;
  children: ReactNode;
}

export function DialogShell({
  open,
  onOpenChange,
  title,
  isPending,
  theme,
  classNames = {},
  children,
}: DialogShellProps) {
  const cn = classNameFor(classNames);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <div className="devdogs-dialog" style={themeToStyle(theme)}>
          <Dialog.Overlay
            className={cn("overlay", "devdogs-dialog__overlay")}
          />
          <Dialog.Content
            className={cn("content", "devdogs-dialog__content")}
            onInteractOutside={(e) => isPending && e.preventDefault()}
            onEscapeKeyDown={(e) => isPending && e.preventDefault()}
          >
            <div className={cn("header", "devdogs-dialog__header")}>
              <Dialog.Title className={cn("title", "devdogs-dialog__title")}>
                {title}
              </Dialog.Title>
              <Dialog.Close
                className={cn("closeButton", "devdogs-dialog__close")}
                disabled={isPending}
                aria-label="Close"
              >
                ×
              </Dialog.Close>
            </div>
            {children}
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function DialogFooter({
  cn,
  isPending,
  submitLabel,
  pendingLabel,
}: {
  cn: ReturnType<typeof classNameFor>;
  isPending: boolean;
  submitLabel: string;
  pendingLabel: string;
}) {
  return (
    <div className={cn("footer", "devdogs-dialog__footer")}>
      <Dialog.Close
        type="button"
        className={cn("cancelButton", "devdogs-dialog__cancel")}
        disabled={isPending}
      >
        Cancel
      </Dialog.Close>
      <button
        type="submit"
        className={cn("submitButton", "devdogs-dialog__submit")}
        disabled={isPending}
      >
        {isPending ? pendingLabel : submitLabel}
      </button>
    </div>
  );
}
