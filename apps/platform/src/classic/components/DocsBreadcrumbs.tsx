/**
 * The trail above a docs page or folder: the project, then the folders it
 * sits under. Text rather than links: the sidebar beside it already navigates
 * to every one of these, and a row of near-identical links above the title
 * competes with it.
 */
export default function DocsBreadcrumbs({ items }: { items: string[] }) {
  if (items.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1 text-sm text-mauve-400">
        {items.map((crumb, i) => (
          <li key={i} className="flex items-center gap-1">
            {i > 0 && (
              <span aria-hidden className="text-mauve-600">
                /
              </span>
            )}
            <span>{crumb}</span>
          </li>
        ))}
      </ol>
    </nav>
  );
}
