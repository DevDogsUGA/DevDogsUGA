import * as icons from "~/config/icons";
import { docsProjectMark } from "~/config/docs";

interface Props {
  /** The docs slug, i.e. the project's workspace directory name. */
  slug: string;
  /**
   * `sm` for a row in a menu or a select; `lg` for the landing page's tiles,
   * where the mark is the thing you look at and carries the block shadow the
   * app switcher's icons do.
   */
  size?: "sm" | "lg";
}

/**
 * A documented project's app icon, drawn on its own fill — the same mark the
 * fullscreen switcher gives that project, so it is recognisable wherever the
 * docs list it. The rim and shadow stay black, as everywhere else on the site.
 */
export default function DocsProjectMark({ slug, size = "sm" }: Props) {
  const { icon, iconBg } = docsProjectMark(slug);
  const Icon = icons[icon];

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
