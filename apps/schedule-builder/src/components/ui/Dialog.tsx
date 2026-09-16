"use client";

import { type ReactNode } from "react";
import * as RadixDialog from "@radix-ui/react-dialog";
import { XIcon } from "@phosphor-icons/react/ssr";

interface DialogProps {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  /** Rendered right-aligned below a divider when present. */
  footer?: ReactNode;
  /** Extra classes for the panel, e.g. a `max-w-*` override. */
  className?: string;
}

/**
 * The app's one modal shell: overlay, centered panel, titled header with a
 * close button, and an optional footer. Consumers are mounted while open, so
 * there is no `open` prop — closing is always the caller unmounting us via
 * `onClose` (Radix still drives it for Escape, overlay clicks, and the focus
 * trap).
 */
export function Dialog({
  title,
  onClose,
  children,
  footer,
  className = "max-w-md",
}: DialogProps) {
  return (
    <RadixDialog.Root open onOpenChange={(open) => !open && onClose()}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="animate-fadeInOverlay fixed inset-0 z-50 bg-black/40" />
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <RadixDialog.Content
            className={`border-edge bg-surface flex max-h-[90dvh] w-full flex-col rounded-xl border shadow-xl ${className}`}
          >
            <div className="border-edge flex items-center justify-between border-b px-6 py-4">
              <RadixDialog.Title className="text-lg font-bold">
                {title}
              </RadixDialog.Title>
              <RadixDialog.Close
                aria-label="Close"
                className="text-muted hover:bg-surface-muted hover:text-foreground rounded-md p-1 transition-colors"
              >
                <XIcon weight="bold" size={20} />
              </RadixDialog.Close>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              {children}
            </div>

            {footer && (
              <div className="border-edge flex justify-end gap-3 border-t px-6 py-4">
                {footer}
              </div>
            )}
          </RadixDialog.Content>
        </div>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
