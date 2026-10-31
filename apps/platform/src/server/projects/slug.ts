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
