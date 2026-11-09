import type { ComponentPropsWithoutRef } from "react";
import { cn } from "~/lib/cn";

/**
 * The card the OAuth approval steps sit on, on the chrome-free ground of
 * `(auth)/layout.tsx`. Same surface as the baseline's consent card.
 */
export default function AuthCard({
  className,
  ...props
}: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      {...props}
      className={cn(
        "w-full max-w-sm rounded-xl border-2 border-mauve-800 bg-mauve-900 p-8 shadow-lg shadow-black/30",
        className,
      )}
    />
  );
}
