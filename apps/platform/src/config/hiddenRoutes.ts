/** Parked during the pre-Cosmic rollback. Match whole path segments. */
export const HIDDEN_ROUTES = [
  "/dashboard/badges",
  "/dashboard/graphics",
  "/dashboard/hackathons",
  "/dashboard/projects",
  "/dashboard/reviews",
  "/dashboard/reflections",
  "/dashboard/schedule",
  "/preview/kit",
] as const;

/**
 * Hidden pages under a dynamic segment, which a path prefix cannot name. The
 * meeting graphics page is a post-review feature; its `image` and `zip`
 * handlers live under `/dashboard/graphics/meetings`, not here.
 */
const HIDDEN_ROUTE_PATTERNS = [
  /^\/dashboard\/meetings\/[^/]+\/graphics(?:\/|$)/,
];

/** Existing API handlers keep their own authorization and response behavior. */
const KEPT_API_ROUTES = [
  /^\/dashboard\/graphics\/brand\/?$/,
  /^\/dashboard\/graphics\/meetings\/[^/]+\/(?:image|zip)\/?$/,
];

export function isHiddenRoute(path: string): boolean {
  let pathname = path.split(/[?#]/)[0]!;
  try {
    pathname = decodeURIComponent(pathname);
  } catch {
    /* Invalid escapes do not match a page. */
  }
  if (KEPT_API_ROUTES.some((route) => route.test(pathname))) return false;
  return (
    HIDDEN_ROUTES.some(
      (hidden) => pathname === hidden || pathname.startsWith(`${hidden}/`),
    ) || HIDDEN_ROUTE_PATTERNS.some((pattern) => pattern.test(pathname))
  );
}

export function isHiddenNavigation(path: string): boolean {
  return path.split(/[?#]/)[0] === "/dashboard" || isHiddenRoute(path);
}
