import type { PropsWithChildren, ReactNode } from "react";
import type { AccentColor } from "~/ui/accent-blobs";

const ACCENT_TEXT: Record<AccentColor, string> = {
  amber: "text-amber-300",
  blue: "text-blue-300",
  cyan: "text-cyan-300",
  emerald: "text-emerald-300",
  rose: "text-rose-300",
  violet: "text-violet-300",
};

interface Props extends PropsWithChildren {
  title: string;
  description?: ReactNode;
  accent: AccentColor;
}

/**
 * The page's title, and the only `h1` on it.
 *
 * Nothing above this in the tree supplies one — TopNav is chrome and the site
 * layout contributes a landmark rather than a heading — so opening at `h2`
 * left every gated screen with an outline that started one level down. The
 * card headers beneath it are the `h2`s; see `ConsoleCard.Header`.
 */
export default function PageHeader({
  title,
  description,
  accent,
  children,
}: Props) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 px-1">
      <div className="flex flex-col gap-1.5">
        <h1
          className={`font-display text-3xl font-bold ${ACCENT_TEXT[accent]}`}
        >
          {title}
        </h1>
        {description && (
          <p className="max-w-prose text-sm text-mauve-400">{description}</p>
        )}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}
