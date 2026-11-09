import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ChangelogEmail,
  GDGC_ISSUES,
  gdgcIssueByVersion,
  paintCss,
  PALETTE,
  webRenderContext,
} from "@devdogsuga/newsletter";

/**
 * /newsletters/gdgc/[version], one issue, rendered from the same email-safe
 * components the exported send uses. The only thing that differs is the
 * `RenderContext`: pages get the `next/font` CSS variables the root layout
 * sets and SVG data-URI images; the send gets literal font stacks and
 * embedded PNGs. Copy cannot drift between the archive and an inbox because
 * there is exactly one copy.
 */

/**
 * Static data from `@devdogsuga/newsletter`; changes only with a deploy.
 */
export const revalidate = false;

export function generateStaticParams() {
  return GDGC_ISSUES.map((issue) => ({ version: issue.version }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ version: string }>;
}): Promise<Metadata> {
  const { version } = await params;
  const issue = gdgcIssueByVersion(version);
  // A dead link still gets unfurled, so it gets an honest card rather than
  // the archive's own title.
  if (!issue) return { title: "GDGC Newsletter | DevDogs" };
  return {
    title: `GDGC Newsletter Issue ${issue.version} | DevDogs`,
    description: issue.preview,
  };
}

export default async function ChangelogIssue({
  params,
}: {
  params: Promise<{ version: string }>;
}) {
  const { version } = await params;
  const issue = gdgcIssueByVersion(version);
  if (!issue) notFound();

  return (
    <div className="flex-1" style={{ backgroundColor: PALETTE.bar }}>
      <div className="mx-auto w-full max-w-2xl px-4 pt-28 pb-24">
        <p className="mb-6 font-mono text-sm">
          <Link
            href="/newsletters/gdgc"
            className="transition-colors hover:brightness-125"
            style={{ color: PALETTE.dim }}
          >
            cd ../newsletters/gdgc
          </Link>
        </p>
        <div className="mx-auto w-fit max-w-full overflow-x-auto">
          {/* The email paints its backgrounds by class (never inline — see
              Backstage's packages/newsletter/src/darkmode.ts), so the page embeds the
              same base paint layer the mailed document does. */}
          <style dangerouslySetInnerHTML={{ __html: paintCss() }} />
          <ChangelogEmail issue={issue} ctx={webRenderContext()} />
        </div>
      </div>
    </div>
  );
}
