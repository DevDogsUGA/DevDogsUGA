import Image from "next/image";
import type { ComponentType } from "react";
import devdog from "~/assets/devdog.svg";
import * as icons from "~/config/icons";
import { docsProjectMark } from "~/config/docs";

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
      className={`flex shrink-0 items-center justify-center border-black text-black ${iconBg} ${box}`}
    >
      <Icon weight="bold" />
    </span>
  );
}

/** The mascot at a mark's size: the platform's own icon, as in the navbar. */
function Logo({ size = "sm" }: { size?: MarkSize }) {
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center ${size === "lg" ? "size-12" : "size-6"}`}
    >
      <Image alt="" src={devdog} sizes={size === "lg" ? "48px" : "24px"} />
    </span>
  );
}

/** A filled glyph in its color with no tile, in a mark's box so rows still
 * line up. */
function Glyph({
  icon: Icon,
  color,
  size = "sm",
}: {
  icon: MarkProps["icon"];
  color: string;
  size?: MarkSize;
}) {
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center ${color} ${size === "lg" ? "size-12 text-4xl" : "size-6 text-lg"}`}
    >
      <Icon weight="fill" />
    </span>
  );
}

/**
 * A documented project's mark: the mascot for the platform, else a bare
 * glyph in the project's color: an app's own logo, or a Phosphor icon (see
 * DOCS_PROJECT_MARKS).
 */
export default function DocsProjectMark({
  slug,
  size,
}: {
  /** The docs slug, i.e. the project's workspace directory name. */
  slug: string;
  size?: MarkSize;
}) {
  const { kind, icon, color } = docsProjectMark(slug);

  if (kind === "logo") return <Logo size={size} />;
  return <Glyph icon={icons[icon]} color={color} size={size} />;
}
