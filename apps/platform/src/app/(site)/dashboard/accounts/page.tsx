import { redirect } from "next/navigation";

type Params = Record<string, string | string[] | undefined>;

/**
 * Connected accounts are part of the profile page, as they were part of the
 * single account page at the baseline. A temporary redirect (never permanent:
 * browsers cache those, and this path may return), carrying the query string so
 * the result of a link round trip that started before the move still reaches
 * the page that shows it.
 */
export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const item of Array.isArray(value) ? value : value ? [value] : []) {
      query.append(key, item);
    }
  }
  redirect(`/dashboard/profile${query.size ? `?${query.toString()}` : ""}`);
}
