/** Parked during the pre-Cosmic rollback. Match whole path segments. */
export const HIDDEN_ROUTES = [
  "/dashboard/apps",
  "/dashboard/badges",
  "/dashboard/graphics",
  "/dashboard/hackathons",
  "/dashboard/projects",
  "/dashboard/reviews",
  "/dashboard/reflections",
  "/dashboard/schedule",
  "/preview/kit",
] as const;

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
  return HIDDEN_ROUTES.some(
    (hidden) => pathname === hidden || pathname.startsWith(`${hidden}/`),
  );
}

export function isHiddenNavigation(path: string): boolean {
  return path.split(/[?#]/)[0] === "/dashboard" || isHiddenRoute(path);
}
