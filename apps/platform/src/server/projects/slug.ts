/** Kept in sync with guard_project_structure(); platform belongs to the seed. */
export const RESERVED_PROJECT_SLUGS = [
  "platform",
  "toolkit",
  "workshops",
  "schedule-builder",
  "operations",
] as const;
export const PROJECT_SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export function isProjectSlug(slug: string): boolean {
  return slug.length >= 2 && slug.length <= 80 && PROJECT_SLUG_REGEX.test(slug);
}
export function isReservedProjectSlug(slug: string): boolean {
  return RESERVED_PROJECT_SLUGS.some((reserved) => reserved === slug);
}

/** Room left under the 80-character limit for a `-NN` collision suffix. */
const SLUG_BASE_MAX = 74;

/** A name as a slug base: lowercase words joined by hyphens, accents folded. */
export function slugBase(name: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, SLUG_BASE_MAX)
    .replace(/-+$/u, "");
  return base.length >= 2 ? base : "project";
}

/**
 * The slug for a new project: the name's base, or the base with the lowest
 * numeric suffix that is free (`my-app`, `my-app-2`, `my-app-3`). A reserved
 * slug counts as taken, so `platform` stays the seed's.
 */
export function projectSlug(name: string, taken: ReadonlySet<string>): string {
  const base = slugBase(name);
  const free = (slug: string) =>
    !taken.has(slug) && !isReservedProjectSlug(slug);
  if (free(base)) return base;
  for (let n = 2; ; n += 1) {
    const slug = `${base}-${n}`;
    if (free(slug)) return slug;
  }
}

/** A project route segment: the slug, or the UUID that links from before slugs use. */
export const PROJECT_ID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
export const PROJECT_ICON_KEYS = [
  "HouseIcon",
  "DogDaysIcon",
  "DogPackIcon",
  "MagnifyingGlassIcon",
  "dogdays",
  "dogpack",
] as const;
export const PROJECT_COLOR_KEYS = [
  "foreground",
  "cyan-400",
  "red-600",
  "red-700",
  "purple-500",
  "emerald-400",
] as const;

/** A project's dashboard path. */
export function projectPath(project: { slug: string }) {
  return `/dashboard/projects/${project.slug}`;
}
