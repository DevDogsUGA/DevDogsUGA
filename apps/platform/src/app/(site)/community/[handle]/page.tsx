import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PublicProfile from "~/components/PublicProfile";
import { metadataFor } from "~/components/PublicProfile/view";
import {
  getPublicProfileActivity,
  getPublicProfileByHandle,
} from "~/server/loaders/publicProfiles";
import { handleFromSegment } from "~/lib/profilePath";

/**
 * /community/@<handle>, a verified member's public profile.
 *
 * The folder is `[handle]`, not `@handle`: Next reads a folder starting with
 * `@` as a parallel-route slot. The `@` arrives in the segment and
 * `handleFromSegment` checks for it.
 *
 * Cached HTML: nothing here reads the request, so the page is the same for
 * every visitor and re-renders at most once a minute. `setHandle` and the
 * visibility actions revalidate `profilePath(handle)` so a change shows at
 * once. Not pre-rendered with `generateStaticParams`; like the competition
 * pages, handles are database rows, rendered on first request.
 *
 * Every miss is `notFound()` from one place: no `@`, no such handle, a hidden
 * profile, an unverified or quarantined member. They are one answer, so the
 * page cannot be used to probe which handles exist.
 */
export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const handle = handleFromSegment((await params).handle);
  const profile = handle ? await getPublicProfileByHandle(handle) : null;

  // Same title as the 404 page, so metadata does not distinguish a miss either.
  if (!profile) return { title: "Page not found | DevDogs" };

  return { ...metadataFor(profile), robots: { index: true, follow: true } };
}

export default async function CommunityProfilePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const handle = handleFromSegment((await params).handle);
  if (!handle) notFound();

  const [profile, activity] = await Promise.all([
    getPublicProfileByHandle(handle),
    getPublicProfileActivity(handle),
  ]);
  if (!profile || !activity) notFound();

  return <PublicProfile profile={profile} activity={activity} />;
}
