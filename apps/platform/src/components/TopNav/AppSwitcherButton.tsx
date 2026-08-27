"use client";

import { DotsNineIcon } from "@phosphor-icons/react/ssr";
import { AppSwitcherTrigger } from "~/components/AppSwitcher/provider";

export default function AppSwitcherButton() {
  return (
    <AppSwitcherTrigger>
      <button
        type="button"
        className="relative z-10 hidden size-9 items-center justify-center rounded-sm text-mauve-300 transition-colors hover:bg-mauve-800 hover:text-white md:flex"
      >
        <DotsNineIcon weight="bold" className="size-4.5" />
      </button>
    </AppSwitcherTrigger>
  );
}
