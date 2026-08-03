"use client";

import { MagnifyingGlassIcon } from "@phosphor-icons/react/ssr";
import { useEffect, useState } from "react";
import DevDogsSearchDialog from "~/components/DevDogsSearchDialog";

export default function SearchButton() {
  const [open, setOpen] = useState(false);
  const [ctrl, setCtrl] = useState("Ctrl");

  useEffect(() => {
    // Platform check for the shortcut hint, once mounted (navigator is client-only).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (/mac|iphone|ipad/i.test(navigator.platform)) setCtrl("⌘");

    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((current) => !current);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <button
        type="button"
        aria-label="Search"
        onClick={() => setOpen(true)}
        className="hidden w-48 items-center gap-2 rounded-md border border-mauve-700 bg-mauve-900 px-2 py-1.5 text-sm text-mauve-400 transition-colors hover:bg-mauve-800 hover:text-white md:flex"
      >
        <MagnifyingGlassIcon className="size-4 shrink-0" />
        <span className="flex-1 text-left">Search</span>
        <span className="-mt-px flex gap-0.5 text-xs text-mauve-400 *:rounded-sm *:border *:border-b-2 *:border-mauve-700 *:bg-mauve-900 *:px-1 *:shadow-xs">
          <kbd suppressHydrationWarning>{ctrl}</kbd>
          <kbd>K</kbd>
        </span>
      </button>

      <button
        type="button"
        aria-label="Search"
        onClick={() => setOpen(true)}
        className="flex size-9 items-center justify-center rounded-sm text-mauve-300 transition-colors hover:bg-mauve-800 hover:text-white md:hidden"
      >
        <MagnifyingGlassIcon className="size-4.5" />
      </button>

      <DevDogsSearchDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
