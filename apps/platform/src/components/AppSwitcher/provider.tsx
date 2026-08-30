"use client";

import {
  cloneElement,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { ReactElement, ReactNode } from "react";

interface AppSwitcherContextValue {
  isOpen: boolean;
  /** `origin` is a CSS transform-origin (e.g. "120px 36px") for the expand animation. */
  open: (origin?: string) => void;
  close: () => void;
  toggle: (origin?: string) => void;
  /** Internal render state consumed by the overlay. */
  visible: boolean;
  closing: boolean;
  origin: string;
}

const AppSwitcherContext = createContext<AppSwitcherContextValue | null>(null);

export function useAppSwitcher() {
  const ctx = useContext(AppSwitcherContext);
  if (!ctx)
    throw new Error("useAppSwitcher must be used within AppSwitcherProvider");
  return ctx;
}

const CLOSE_DURATION_MS = 380;

export function AppSwitcherProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const [origin, setOrigin] = useState("calc(100% - 46px) 36px");

  const isOpen = visible && !closing;

  const open = useCallback((at?: string) => {
    if (at) setOrigin(at);
    setClosing(false);
    setVisible(true);
  }, []);

  const close = useCallback(() => {
    setClosing(true);
    setTimeout(() => {
      setVisible(false);
      setClosing(false);
    }, CLOSE_DURATION_MS);
  }, []);

  const toggle = useCallback(
    (at?: string) => {
      if (visible && !closing) close();
      else if (!visible) open(at);
    },
    [visible, closing, open, close],
  );

  useEffect(() => {
    document.body.style.overflow = visible ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [visible]);

  return (
    <AppSwitcherContext.Provider
      value={{ isOpen, open, close, toggle, visible, closing, origin }}
    >
      {children}
    </AppSwitcherContext.Provider>
  );
}

/**
 * Wraps any button element, merging data-state and a toggle handler onto the
 * child, following the Radix data-attribute pattern. The click position seeds
 * the overlay's expand-animation origin.
 */
export function AppSwitcherTrigger({ children }: { children: ReactElement }) {
  const { toggle, isOpen } = useAppSwitcher();

  const onClick = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      (children.props as { onClick?: React.MouseEventHandler }).onClick?.(e);
      const rect = e.currentTarget.getBoundingClientRect();
      toggle(
        `${Math.round(rect.left + rect.width / 2)}px ${Math.round(rect.top + rect.height / 2)}px`,
      );
    },
    [toggle, children],
  );

  return cloneElement(children, {
    "data-state": isOpen ? "open" : "closed",
    "aria-label": isOpen ? "Close app switcher" : "Open app switcher",
    "aria-expanded": isOpen,
    onClick,
  } as Partial<unknown>);
}
