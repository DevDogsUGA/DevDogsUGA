import type { ComponentType } from "react";
import * as icons from "~/config/icons";
import { docsProjectMark } from "~/config/docs";

type MarkSize = "sm" | "lg";

interface MarkProps {
  icon: ComponentType<{ className?: string; weight?: "bold" }>;
  /** The fill behind the glyph — a solid, saturated Tailwind background. */
  iconBg: string;
  /**
   * `sm` for a row in a menu or a select; `lg` for a tile, where the mark is
   * the thing you look at and carries the block shadow the app switcher's
   * icons do.
   */
  size?: MarkSize;
}

/**
 * An app-icon-shaped mark. The rim and shadow stay black, as everywhere else
 * on the site — it is the surface beneath that lifts, to give them something
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
      className={`flex shrink-0 items-center justify-center border-black text-black ${iconBg} ${box}`}
    >
      <Icon weight="bold" />
    </span>
  );
}

/**
 * A documented project's mark — the same app icon that project wears in the
 * fullscreen switcher, so it is recognisable wherever the docs list it.
 */
export default function DocsProjectMark({
  slug,
  size,
}: {
  /** The docs slug, i.e. the project's workspace directory name. */
  slug: string;
  size?: MarkSize;
}) {
  const { icon, iconBg } = docsProjectMark(slug);

  return <Mark icon={icons[icon]} iconBg={iconBg} size={size} />;
}
