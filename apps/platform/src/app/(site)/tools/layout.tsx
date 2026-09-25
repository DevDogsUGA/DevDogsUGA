import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { expectUserWith } from "~/server/auth";

/**
 * Everything under `/tools` is behind the `expectUserWith` below, so a crawler
 * that follows one of these URLs is redirected to `/auth` and has nothing to
 * index. The `noindex` is for the case that redirect does not cover: a URL that
 * reached an index some other way. It is inherited by every page in the
 * segment, so a tool added later is covered without a second decision.
 *
 * The title is the label `config/nav.ts` gives the one page in here today; a
 * second tool should override it rather than widen this.
 */
export const metadata: Metadata = {
  title: "OAuth Client | DevDogs",
  robots: { index: false },
};

export default async function ToolsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await expectUserWith({
    profile: true,
  }).catch(async () => {
    // `x-request-path` is `middleware.ts`'s carrier for the URL a layout
    // otherwise has no way to ask Next for -- see its comment there. Falls
    // back to a bare `/auth` if the request somehow reached this layout
    // without going through the middleware (e.g. a direct RSC fetch).
    const requestPath = (await headers()).get("x-request-path");
    redirect(
      requestPath
        ? `/auth?callbackPath=${encodeURIComponent(requestPath)}`
        : "/auth",
    );
  });

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-mauve-900">{children}</div>
  );
}
