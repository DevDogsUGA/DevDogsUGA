import type { ReactNode } from "react";
import {
  DOCS_VARIANTS_ROOT_ID,
  prePaintScript,
  type OfferedVariants,
} from "~/lib/docsVariants";
import Controller from "./Controller";

/**
 * The element the docs variant CSS keys on (`data-os`, `data-supabase`), with
 * the inline script that sets those before first paint as its first child.
 * See ~/lib/docsVariants.
 *
 * `suppressHydrationWarning` because the script writes attributes the server
 * never rendered, by design, before React hydrates this element.
 */
export default function DocsVariants({
  offered,
  className,
  children,
}: {
  offered: OfferedVariants;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      id={DOCS_VARIANTS_ROOT_ID}
      className={className}
      suppressHydrationWarning
    >
      <script dangerouslySetInnerHTML={{ __html: prePaintScript(offered) }} />
      <Controller offered={offered} />
      {children}
    </div>
  );
}
