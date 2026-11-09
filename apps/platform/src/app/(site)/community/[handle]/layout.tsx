import { notFound } from "next/navigation";
import { handleFromSegment } from "~/lib/profilePath";
import { getPublicProfileByHandle } from "~/server/loaders/publicProfiles";
import { publicProfilesEnabled } from "~/server/features";

/**
 * Answers a profile miss with an HTTP 404, which the page alone cannot.
 *
 * On a full page load vinext checks layouts for `notFound()` before it starts
 * the response, but not the page. A page that calls `notFound()` after its
 * database read loses the race to the site layout's <Suspense> shell, so the
 * miss rendered the 404 page with a 200. The same lookup here runs first. The
 * page repeats it for free (`getPublicProfileByHandle` is per-request cached)
 * and keeps its own checks.
 */
export default async function ProfileLayout({
  children,
  params,
}: LayoutProps<"/community/[handle]">) {
  if (!publicProfilesEnabled()) notFound();
  const handle = handleFromSegment((await params).handle);
  if (!handle || !(await getPublicProfileByHandle(handle))) notFound();
  return children;
}
