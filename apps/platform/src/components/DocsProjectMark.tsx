import Image from "next/image";
import { cn } from "~/lib/cn";
import type { ComponentType } from "react";
import devdog from "~/assets/devdog.svg";
import * as icons from "~/config/icons";
import type { DocsMark } from "~/config/docs";
import { showcaseColor, showcaseIcon } from "~/config/showcaseKeys";
import type { EventCategory } from "~/lib/eventKind";
import "~/components/Docs/docs.css";

type MarkSize = "sm" | "lg";

interface MarkProps {
  icon: ComponentType<{ className?: string; weight?: "bold" | "fill" }>;
  /** The event category hue behind the glyph; omit for the club red. */
  kind?: EventCategory;
  size?: MarkSize;
  /** Legacy fill class (TopNav's sub-menu rows); the tile paints from `kind` now. */
  iconBg?: string;
}

/** `.pm` (docs kit): a stepped tile in the hue, white glyph. */
export function Mark({ icon: Icon, kind, size = "sm", iconBg }: MarkProps) {
  return (
    <span
      aria-hidden
      data-kind={kind}
      className={cn(size === "lg" ? "docs-pm lg" : "docs-pm", iconBg)}
    >
      <Icon weight="bold" />
    </span>
  );
}

/**
 * A docs project's mark, drawn from what names it (`DocsMark` in `~/config/docs`):
 *
 * - a Project's own icon and color keys, through the showcase registry: the
 *   DevDogs mascot on its tile for the platform, otherwise the bare glyph in
 *   the Project's color, as the homepage and the app switcher draw it;
 * - a Docs section's glyph on a tile in its hue;
 * - a generic book for a documented project with no showcase fields.
 */
export default function DocsProjectMark({
  mark,
  size,
}: {
  mark: DocsMark;
  size?: MarkSize;
}) {
  if (mark.kind === "section") {
    return <Mark icon={icons[mark.icon]} kind={mark.hue} size={size} />;
  }
  if (mark.kind === "fallback") {
    return <Mark icon={icons.BookOpenIcon} size={size} />;
  }

  const { Icon, logo } = showcaseIcon(mark.iconKey);
  if (logo) {
    return (
      <span aria-hidden className={size === "lg" ? "docs-pm lg" : "docs-pm"}>
        <Image alt="" src={devdog} sizes="32px" />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center",
        size === "lg" ? "size-11 text-[34px]" : "size-8 text-[26px]",
        showcaseColor(mark.colorKey),
      )}
    >
      <Icon weight="fill" />
    </span>
  );
}
