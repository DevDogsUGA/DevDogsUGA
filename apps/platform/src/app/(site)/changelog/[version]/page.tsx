import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ChangelogEmail,
  ISSUES,
  issueByVersion,
  paintCss,
  PALETTE,
  webRenderContext,
} from "@devdogsuga/newsletter";

/**
 * /changelog/[version], one issue, rendered from the same email-safe
 * components the exported send uses. The only thing that differs is the
 * `RenderContext`: pages get the `next/font` CSS variables the root layout
 * sets and SVG data-URI images; the send gets literal font stacks and
 * embedded PNGs. Copy cannot drift between the archive and an inbox because
 * there is exactly one copy.
 */

export function generateStaticParams() {
  return ISSUES.map((issue) => ({ version: issue.version }));
}

export async function generateMetadata({
  params,
}: PageProps<"/changelog/[version]">): Promise<Metadata> {
  const { version } = await params;
  const issue = issueByVersion(version);
  // A dead link still gets unfurled, so it gets an honest card rather than
  // the archive's own title.
  if (!issue) return { title: "Changelog | DevDogs" };
  return {
    title: `Changelog v${issue.version} | DevDogs`,
    description: issue.preview,
  };
}

export default async function ChangelogIssue({
  params,
}: PageProps<"/changelog/[version]">) {
  const { version } = await params;
  const issue = issueByVersion(version);
  if (!issue) notFound();

  return (
    <div className="flex-1" style={{ backgroundColor: PALETTE.bar }}>
      <div className="mx-auto w-full max-w-2xl px-4 pt-28 pb-24">
        <p className="mb-6 font-mono text-sm">
          <Link
            href="/changelog"
            className="transition-colors hover:brightness-125"
            style={{ color: PALETTE.dim }}
          >
            cd ../changelog
          </Link>
        </p>
        <div className="mx-auto w-fit max-w-full overflow-x-auto">
          {/* The email paints its backgrounds by class (never inline — see
              packages/newsletter/src/darkmode.ts), so the page embeds the
              same base paint layer the mailed document does. */}
          <style dangerouslySetInnerHTML={{ __html: paintCss() }} />
          <ChangelogEmail issue={issue} ctx={webRenderContext()} />
        </div>
      </div>
    </div>
  );
}
