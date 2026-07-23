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

export default function PageHeader({
  title,
  description,
  accent,
  children,
}: Props) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 px-1">
      <div className="flex flex-col gap-1.5">
        <h2
          className={`font-display text-3xl font-bold ${ACCENT_TEXT[accent]}`}
        >
          {title}
        </h2>
        {description && (
          <p className="max-w-prose text-sm text-mauve-400">{description}</p>
        )}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}
