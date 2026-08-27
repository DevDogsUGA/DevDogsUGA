import type { PropsWithChildren, ReactNode } from "react";
import AccentBlobs, { type AccentColor } from "~/ui/accent-blobs";
import PageHeader from "~/components/PageHeader";

interface PageShellProps extends PropsWithChildren {
  accent: AccentColor;
  title: string;
  description?: ReactNode;
  /**
   * Rendered opposite the title, in the header's own row. A page-level control
   * belongs here rather than above the first card, where it has to be dragged
   * back over the header's margin to look attached to anything.
   */
  actions?: ReactNode;
}

/**
 * The opening of every page inside the site layout: centred column, the accent
 * wash behind it, and the title.
 *
 * Was `ConsolePageShell`, which was never accurate — the console is six of its
 * callers and one of the rest is the public results page. It is the app's page
 * shell, and the name no longer implies a permission.
 */
export default function PageShell({
  accent,
  title,
  description,
  actions,
  children,
}: PageShellProps) {
  return (
    <div className="relative isolate mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 @sm:px-6">
      <AccentBlobs accent={accent} />
      <PageHeader title={title} description={description} accent={accent}>
        {actions}
      </PageHeader>
      {children}
    </div>
  );
}
