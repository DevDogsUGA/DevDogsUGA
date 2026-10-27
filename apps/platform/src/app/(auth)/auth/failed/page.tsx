import type { Metadata } from "next";
import { GoogleLogoIcon, HouseIcon } from "@phosphor-icons/react/ssr";
import {
  parseFailureQuery,
  retryUrl,
  SIGN_IN_FAILURE_COPY,
} from "~/server/auth/signInFailure";
import Callout from "~/ui/callout";
import LinkButton from "~/ui/link-button";
import { TextLink } from "~/ui/text-link";

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
    <div className="card w-full max-w-md p-8">
      <h1 className="display mb-4 text-4xl">{copy.title}</h1>
      <Callout tone={TONES[failure]} alert>
        {copy.body}
      </Callout>
      <div className="mt-6 flex flex-col gap-3">
        <span className="btn-shadow flex">
          <LinkButton
            href={retryUrl(returnTo)}
            prefetch={false}
            variant="default"
            size="lg"
            className="w-full"
          >
            <GoogleLogoIcon weight="bold" aria-hidden /> Try again
          </LinkButton>
        </span>
        <LinkButton href="/" variant="secondary" className="w-full">
          <HouseIcon weight="bold" aria-hidden /> Back to the site
        </LinkButton>
      </div>
      {ref && (
        <p className="mt-6 font-mono text-sm text-[var(--text-3)]">
          Reference {ref}
        </p>
      )}
      <p className="mt-4 text-sm text-[var(--text-3)]">
        Need a hand?{" "}
        <TextLink href="/discord" className="inline">
          Ask in Discord
        </TextLink>
        .
      </p>
    </div>
  );
}
