import type { ReactNode } from "react";

/**
 * The baseline `/console` layout's column: every console page sat in a
 * `bg-mauve-900` flex child of the site layout. The dashboard layout has no
 * wrapper, so each console page applies this.
 */
export default function ConsoleFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col bg-mauve-900">{children}</div>
  );
}
