import Link from "next/link";
import type { ReactNode } from "react";
import "~/components/Docs/docs.css";

export interface DocsTile {
  href: string;
  title: string;
  description?: string | null;
  /** Right-hand column: a course's progress, say. */
  status?: ReactNode;
  /** The tile-shaped mark drawn beside the title. */
  mark: ReactNode;
}

/**
 * The docs' way of offering a set of destinations: rows with a mark, a name, a
 * line of description and an optional status on the right (the hub's list).
 * The landing page lists projects and courses this way, and a folder with no
 * index page of its own lists its contents the same way, so arriving at
 * either reads as the same kind of place.
 *
 */
export default function DocsTileGrid({ tiles }: { tiles: DocsTile[] }) {
  return (
    <ul className="docs-list">
      {tiles.map((tile) => (
        <li key={tile.href}>
          <Link href={tile.href} className="docs-list-item">
            {tile.mark}
            <h3 className="docs-list-nm">{tile.title}</h3>
            {tile.description && (
              <p className="docs-list-ds">{tile.description}</p>
            )}
            {tile.status && <div className="docs-list-st">{tile.status}</div>}
          </Link>
        </li>
      ))}
    </ul>
  );
}
