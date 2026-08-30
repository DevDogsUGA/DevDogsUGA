import Link from "next/link";
import type { ReactNode } from "react";

export interface DocsTile {
  href: string;
  title: string;
  description?: string | null;
  /** The app-icon-shaped mark drawn beside the title. */
  mark: ReactNode;
}

/**
 * The docs' way of offering a set of destinations: the app switcher's project
 * tile, in a two-column grid. The landing page lists projects this way, and a
 * folder with no index page of its own lists its contents the same way, so
 * arriving at either reads as the same kind of place.
 *
 * Each tile is one control: the link stretches over the whole card with its
 * own ::after rather than nesting the card's block content inside an anchor.
 */
export default function DocsTileGrid({ tiles }: { tiles: DocsTile[] }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {tiles.map((tile) => (
        <li
          key={tile.href}
          className="group relative flex items-center gap-4 rounded-md border border-mauve-700 bg-mauve-800 px-4 py-3 transition-colors hover:border-mauve-500 hover:bg-mauve-700"
        >
          <span className="transition-transform group-hover:-translate-y-0.5">
            {tile.mark}
          </span>
          <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
            <h3 className="font-display leading-none font-bold text-white">
              <Link
                href={tile.href}
                className="rounded-sm outline-none after:absolute after:inset-0 focus-visible:ring-2 focus-visible:ring-white"
              >
                {tile.title}
              </Link>
            </h3>
            {tile.description && (
              <p className="text-xs/relaxed text-balance text-mauve-400">
                {tile.description}
              </p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
