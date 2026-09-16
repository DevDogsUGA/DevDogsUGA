"use client";

import { useEffect, useState } from "react";
import { DesktopIcon, MoonIcon, SunIcon } from "@phosphor-icons/react/ssr";

type Theme = "system" | "light" | "dark";

const ORDER: Theme[] = ["system", "light", "dark"];

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

/**
 * Cycles system → light → dark. The choice lives in `localStorage.theme`
 * ("system" = no entry), which the root layout's inline script also reads so
 * the class is right before first paint; here we only keep it right across
 * clicks and, in system mode, OS preference changes.
 */
export function ThemeSwitcher() {
  // null until mounted: the stored choice isn't knowable server-side, so the
  // first client render must match the SSR placeholder.
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("theme");
    setTheme(stored === "light" || stored === "dark" ? stored : "system");
  }, []);

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
        setTheme(next);
      }}
      title={current.label}
      aria-label={current.label}
      className="rounded-lg p-2 text-xl text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
    >
      {theme === null ? (
        <span className="block size-[1em]" />
      ) : (
        <current.Icon weight="duotone" />
      )}
    </button>
  );
}
