/**
 * Turns a slug or filename stem into a display label:
 * `documentation-system` → `Documentation System`.
 *
 * Kept here rather than imported from the docs packages. It is a presentation
 * concern used for breadcrumbs and sidebar folder labels, and the content
 * package deliberately exports data and types only.
 */
export function toTitleCase(name: string): string {
  return name
    .replace(/[-_]/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
