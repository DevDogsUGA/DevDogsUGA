import type { ReactNode } from "react";

/**
 * A named place on a settings page that search can land on
 * (`/dashboard/accounts#github`). It renders only the anchor: the content
 * already carries its own heading, so `label` and `description` exist for
 * `config/pageSections.ts`, whose test reads them back out of the page source.
 */
export default function SettingsAnchor({
  id,
  children,
}: {
  id: string;
  /** What search shows for this place. */
  label: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div id={id} className="scroll-mt-20">
      {children}
    </div>
  );
}
