"use client";

import * as Popover from "@radix-ui/react-popover";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

// ── ComboboxPanel ─────────────────────────────────────────────────────────────
// Standalone animated container for non-Radix combobox popovers (SettingsSearch).
// Caller controls mounting; `open` drives data-state for the CSS animation.

interface ComboboxPanelProps {
  open: boolean;
  className?: string;
  children: ReactNode;
}

export function ComboboxPanel({
  open,
  className,
  children,
}: ComboboxPanelProps) {
  return (
    <div
      data-state={open ? "open" : "closed"}
      className={
        "md:combobox-panel overflow-hidden" + (className ? " " + className : "")
      }
    >
      {children}
    </div>
  );
}

// ── ComboboxPopover ───────────────────────────────────────────────────────────
// Compound object for Radix-based combobox popovers (PronounsField).
// Content wraps Popover.Content, adding combobox-popover so the CSS animation fires.
// Radix Presence reads animationend and delays unmounting for the exit animation.

function Content({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof Popover.Content>) {
  return (
    <Popover.Content
      className={
        "combobox-popover overflow-hidden" + (className ? " " + className : "")
      }
      {...props}
    />
  );
}

export const ComboboxPopover = {
  Root: Popover.Root,
  Anchor: Popover.Anchor,
  Portal: Popover.Portal,
  Content,
};
