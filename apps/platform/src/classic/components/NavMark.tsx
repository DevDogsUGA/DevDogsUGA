import { cn } from "~/lib/cn";
import type { ComponentType } from "react";
type MarkSize = "sm" | "lg";

interface MarkProps {
  icon: ComponentType<{ className?: string; weight?: "bold" | "fill" }>;
  /** The fill behind the glyph: a solid, saturated Tailwind background. */
  iconBg: string;
  /**
   * `sm` for a row in a menu or a select; `lg` for a tile, where the mark is
   * the thing you look at and carries the same block shadow as the app
   * switcher's icons.
   */
  size?: MarkSize;
}

/**
 * An app-icon-shaped mark. The rim and shadow stay black, as everywhere else
 * on the site. The color goes on the surface beneath, so they have something
 * to read against.
 */
export function Mark({ icon: Icon, iconBg, size = "sm" }: MarkProps) {
  const box =
    size === "lg"
      ? "shadow-block-sm size-12 rounded-xl border-2 text-2xl shadow-black"
      : "size-6 rounded-md border text-sm";

  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center border-black text-black",
        iconBg,
        box,
      )}
    >
      <Icon weight="bold" />
    </span>
  );
}
