"use client";

import { toast as sonnerToast } from "sonner";
import { CheckIcon, WarningCircleIcon, XIcon } from "@phosphor-icons/react/ssr";

interface Props {
  id: string | number;
  message: string;
  type: "success" | "error";
}

const styles = {
  success: {
    wrapper:
      "bg-cyan-100 border-cyan-500 shadow-[2px_2px_0_0_var(--color-cyan-500)]",
    icon: "text-cyan-700",
    dismiss: "text-cyan-600 hover:text-cyan-900 focus-visible:ring-cyan-500",
  },
  error: {
    wrapper:
      "bg-rose-100 border-rose-600 shadow-[2px_2px_0_0_var(--color-rose-600)]",
    icon: "text-rose-700",
    dismiss: "text-rose-500 hover:text-rose-800 focus-visible:ring-rose-600",
  },
} as const;

export default function Toast({ id, message, type }: Props) {
  const s = styles[type];
  return (
    <div
      className={`flex w-90 items-start gap-3 rounded-sm border px-4 py-3 ${s.wrapper}`}
    >
      <span className={`mt-0.5 shrink-0 text-base ${s.icon}`}>
        {type === "success" ? <CheckIcon /> : <WarningCircleIcon />}
      </span>
      <p className="flex-1 text-sm text-mauve-950">{message}</p>
      <button
        onClick={() => sonnerToast.dismiss(id)}
        className={`mt-0.5 shrink-0 rounded-sm transition focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none ${s.dismiss}`}
        aria-label="Dismiss"
      >
        <XIcon />
      </button>
    </div>
  );
}
