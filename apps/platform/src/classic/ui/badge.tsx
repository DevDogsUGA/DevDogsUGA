import type { ReactNode } from "react";
import { cn } from "~/lib/cn";

const VARIANT_CLASSES = {
  default: "bg-white/10 text-mauve-300",
  success: "bg-emerald-500/10 text-emerald-300",
  warning: "bg-amber-500/10 text-amber-300",
  danger: "bg-rose-500/10 text-rose-300",
  info: "bg-blue-500/10 text-blue-300",
} as const;

interface BadgeProps {
  variant?: keyof typeof VARIANT_CLASSES;
  className?: string;
  children: ReactNode;
}

export default function Badge({
  variant = "default",
  className,
  children,
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium",
        VARIANT_CLASSES[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
