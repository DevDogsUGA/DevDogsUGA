"use client";

import { useEffect, useSyncExternalStore } from "react";
import { DesktopIcon, MoonIcon, SunIcon } from "@phosphor-icons/react/ssr";

type Theme = "system" | "light" | "dark";

const ORDER: Theme[] = ["system", "light", "dark"];
const THEME_CHANGE_EVENT = "devdogs-theme-change";

const OPTIONS = {
  system: { Icon: DesktopIcon, label: "System theme" },
  light: { Icon: SunIcon, label: "Light theme" },
  dark: { Icon: MoonIcon, label: "Dark theme" },
} as const;

function apply(theme: Theme) {
  const dark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

function getStoredTheme(): Theme {
  const stored = localStorage.getItem("theme");
  return stored === "light" || stored === "dark" ? stored : "system";
}

function subscribeToTheme(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(THEME_CHANGE_EVENT, onChange);
  };
}

/**
 * Cycles system → light → dark. The choice lives in `localStorage.theme`
 * ("system" = no entry), which the root layout's inline script also reads so
 * the class is right before first paint; here we only keep it right across
 * clicks and, in system mode, OS preference changes.
 */
export function ThemeSwitcher() {
  // The server snapshot stays null through hydration. React reads localStorage
  // immediately afterward, without a mount effect that synchronously sets state.
  const theme = useSyncExternalStore<Theme | null>(
    subscribeToTheme,
    getStoredTheme,
    () => null,
  );

  useEffect(() => {
    if (theme === null) return;
    apply(theme);
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const current = OPTIONS[theme ?? "system"];

  return (
    <button
      type="button"
      onClick={() => {
        const next = ORDER[(ORDER.indexOf(theme ?? "system") + 1) % 3]!;
        if (next === "system") localStorage.removeItem("theme");
        else localStorage.setItem("theme", next);
        window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
      }}
      title={current.label}
      aria-label={current.label}
      className="text-muted hover:bg-surface-muted hover:text-foreground rounded-lg p-2 text-xl transition-colors"
    >
      {theme === null ? (
        <span className="block size-[1em]" />
      ) : (
        <current.Icon weight="duotone" />
      )}
    </button>
  );
}
