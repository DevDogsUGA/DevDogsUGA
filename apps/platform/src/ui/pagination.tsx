import Link from "next/link";

interface PaginationProps {
  page: number;
  totalPages: number;
  /** Given a page number, the href that lands on it. */
  buildHref: (page: number) => string;
  /** Plural noun for the row count, e.g. "events". */
  label?: string;
  totalCount?: number;
}

/**
 * Previous / next across a paged list.
 *
 * Renders nothing at one page: a lone "Page 1 of 1" with two dead arrows is
 * chrome that reports its own irrelevance.
 */
export default function Pagination({
  page,
  totalPages,
  buildHref,
  label,
  totalCount,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <nav
      aria-label={label ? `${label} pages` : "Pagination"}
      className="flex items-center justify-between gap-4"
    >
      <p className="text-sm text-mauve-400 tabular-nums">
        Page {page} of {totalPages}
        {typeof totalCount === "number" && label && (
          <span className="text-mauve-500">
            {" · "}
            {totalCount} {label}
          </span>
        )}
      </p>
      <div className="flex gap-2">
        {page > 1 && (
          <Link href={buildHref(page - 1)} rel="prev" className={STEP}>
            &larr; Previous
          </Link>
        )}
        {page < totalPages && (
          <Link href={buildHref(page + 1)} rel="next" className={STEP}>
            Next &rarr;
          </Link>
        )}
      </div>
    </nav>
  );
}

const STEP =
  "rounded-lg border border-mauve-600 bg-mauve-800 px-3 py-1 text-sm font-medium text-white transition-colors outline-none hover:border-white focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1 focus-visible:ring-offset-mauve-950";
