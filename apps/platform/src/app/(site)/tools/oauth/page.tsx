import { permanentRedirect } from "next/navigation";

/**
 * `/tools/oauth` became `/settings/oauth`. The query string rides along:
 * `devtools oauth` prints `?add_redirect_uri=…` links that the new page reads.
 */
export default async function OAuthRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const v of Array.isArray(value) ? value : value ? [value] : []) {
      query.append(key, v);
    }
  }
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  permanentRedirect(`/settings/oauth${suffix}`);
}
