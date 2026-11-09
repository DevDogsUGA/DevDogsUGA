import type { Metadata } from "next";
import Link from "next/link";
import { GoogleLogoIcon, HouseIcon } from "@phosphor-icons/react/ssr";
import {
  parseFailureQuery,
  retryUrl,
  SIGN_IN_FAILURE_COPY,
} from "~/server/auth/signInFailure";
import AuthCard from "~/classic/components/AuthCard";
import Callout from "~/classic/ui/callout";
import { TextLink } from "~/classic/ui/text-link";

export const metadata: Metadata = {
  title: "Sign-in problem | DevDogs",
  robots: { index: false },
};

const TONES = {
  wrong_account: "critical",
  cancelled: "warning",
  unexpected: "critical",
} as const;

/**
 * Where a sign-in that did not finish ends up. A working sign-in never shows
 * it: `/auth` starts OAuth straight away and the callback sends the visitor on.
 *
 * Everything shown is fixed copy chosen by `reason`; the provider's own error
 * is never rendered, and `returnTo` only ever becomes a validated same-site
 * path in the retry link. The reference appears for an unexpected failure only
 * and is looked up in the logs and Sentry (`signInIncident.ts`).
 */
export default async function SignInProblemPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { failure, returnTo, ref } = parseFailureQuery(await searchParams);
  const copy = SIGN_IN_FAILURE_COPY[failure];

  return (
    <AuthCard className="max-w-md">
      <h1 className="mb-4 text-xl font-semibold text-white">{copy.title}</h1>
      <Callout tone={TONES[failure]} alert>
        {copy.body}
      </Callout>
      <div className="mt-6 flex flex-col gap-3">
        <Link
          href={retryUrl(returnTo)}
          prefetch={false}
          className="flex w-full items-center justify-center gap-[1ch] rounded-sm border-2 border-white bg-white px-4 py-2.5 text-sm font-medium text-black transition outline-none hover:bg-transparent hover:text-white focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1 focus-visible:ring-offset-mauve-950"
        >
          <GoogleLogoIcon weight="bold" aria-hidden /> Try again
        </Link>
        <Link
          href="/"
          className="flex w-full items-center justify-center gap-[1ch] rounded-lg border border-mauve-600 bg-mauve-800 px-4 py-2.5 text-sm font-medium text-white transition-colors outline-none hover:border-white focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1 focus-visible:ring-offset-mauve-950"
        >
          <HouseIcon weight="bold" aria-hidden /> Back to the site
        </Link>
      </div>
      {ref && (
        <p className="mt-6 font-mono text-sm text-mauve-400">Reference {ref}</p>
      )}
      <p className="mt-4 text-sm text-mauve-400">
        Need a hand? <TextLink href="/discord">Ask in Discord</TextLink>.
      </p>
    </AuthCard>
  );
}
