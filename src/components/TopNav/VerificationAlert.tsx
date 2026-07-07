"use client";

import { ShieldWarningIcon } from "@phosphor-icons/react/ssr";
import ProgressBar from "~/ui/progress-bar";
import { useVerification } from "./NavUserProvider";

export default function VerificationAlert() {
  const ctx = useVerification();
  if (!ctx || ctx.isVerified) return null;

  const { completed, total, openDialog } = ctx;

  return (
    <button
      type="button"
      onClick={openDialog}
      className="relative flex w-full flex-col gap-1.5 overflow-hidden rounded-sm border border-rose-900/60 bg-mauve-950 px-2.5 py-2 text-left transition-colors hover:border-rose-800/80"
    >
      <span className="pointer-events-none absolute -top-6 -left-4 h-16 w-16 rounded-full bg-rose-400/25 blur-2xl" />
      <span className="pointer-events-none absolute -right-4 -bottom-4 h-14 w-14 rounded-full bg-rose-500/20 blur-xl" />
      <span className="pointer-events-none absolute top-1 left-1/2 h-10 w-10 -translate-x-1/2 rounded-full bg-rose-300/15 blur-2xl" />

      <span className="relative flex items-center gap-1.5 text-xs font-semibold text-rose-200">
        <ShieldWarningIcon className="shrink-0" />
        Finish Account Setup
      </span>
      <ProgressBar value={completed} max={total} fillColor="sky" />
      <span className="relative text-xs text-rose-300/70">
        {completed}/{total} steps complete
      </span>
    </button>
  );
}
