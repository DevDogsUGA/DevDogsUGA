import type { Metadata } from "next";
import Link from "next/link";
import { ISSUES, PALETTE, UGA } from "@devdogsuga/newsletter";

/**
 * /changelog, the newsletter's archive. The description is the one
 * `config/nav.ts` gives this page under `SEARCH_ONLY_PAGES`; a search result
 * and this unfurl are the same promise about the same page.
 */
export const metadata: Metadata = {
  title: "Changelog | DevDogs",
  description:
    "The weekly DevDogs newsletter: what the club is building and where to show up.",
};

/**
 * The page paints the newsletter's own palette inline rather than site theme
 * tokens, because its content does too: every issue below renders from
 * email-safe components that carry their colors with them. A themed shell
 * around an unthemed email would split at the seam in dark mode.
 */
export default function Changelog() {
  const issues = [...ISSUES].reverse();
  return (
    <div className="flex-1" style={{ backgroundColor: PALETTE.bg }}>
      <div className="mx-auto w-full max-w-2xl px-4 pt-28 pb-24">
        <p className="font-mono text-sm" style={{ color: PALETTE.dim }}>
          $ changelog --list
        </p>
        <h1
          className="font-display mt-2 text-4xl font-bold"
          style={{ color: PALETTE.ink }}
        >
          Changelog_
        </h1>
        <p className="mt-4 max-w-prose" style={{ color: PALETTE.mute }}>
          The weekly DevDogs newsletter, versioned like the software it covers.
          Each issue logs what the club is building and where to show up next.
        </p>

        <ul className="mt-10 space-y-4">
          {issues.map((issue) => (
            <li key={issue.version}>
              <Link
                href={`/changelog/${issue.version}`}
                className="block rounded-md border p-5 transition-colors hover:brightness-110"
                style={{
                  backgroundColor: PALETTE.card,
                  borderColor: PALETTE.border,
                }}
              >
                <div className="flex items-baseline gap-3 font-mono text-sm">
                  <span className="font-bold" style={{ color: UGA }}>
                    v{issue.version}
                  </span>
                  <span style={{ color: PALETTE.dim }}>{issue.sendLabel}</span>
                  <span style={{ color: PALETTE.dim }}>{issue.term}</span>
                </div>
                <p
                  className="font-display mt-2 text-lg font-bold"
                  style={{ color: PALETTE.ink }}
                >
                  {issue.tagline}
                </p>
                <p className="mt-1 text-sm" style={{ color: PALETTE.mute }}>
                  {issue.preview}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
