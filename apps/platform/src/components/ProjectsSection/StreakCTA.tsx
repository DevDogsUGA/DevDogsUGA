import Link from "next/link";
import {
  ArrowRightIcon,
  FlameIcon,
  GithubLogoIcon,
} from "@phosphor-icons/react/ssr";
import { expectUserWith } from "~/server/auth";

export default async function StreakCTA() {
  const user = await expectUserWith({
    githubIdentity: { columns: { id: true } },
  }).catch(() => null);

  const linkedGithubProfile = !!user?.githubIdentity;
  const streak = null;

  // Nothing to say to a visitor who has not linked GitHub: the sign-in flow is
  // unfinished, so the prompt that used to live here could only open an
  // explainer. Returning null rather than an empty wrapper matters — the
  // section spaces its children, so a childless div would still leave a gap.
  if (!linkedGithubProfile) return null;

  if (streak) {
    return (
      <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:gap-4">
        <p className="text-sm text-mauve-600">
          Keep your{" "}
          <span className="font-bold text-amber-700">
            <FlameIcon className="mr-0.5 mb-0.5 inline" />
            {streak}-week streak
          </span>{" "}
          alive — contribute before the week ends.
        </p>
        <Link
          href="https://github.com/DevDogsUGA"
          target="_blank"
          className="transition-lift hover:shadow-block-sm flex shrink-0 items-center gap-2 rounded-sm border-2 border-amber-500 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-amber-500"
        >
          <GithubLogoIcon />
          Complete an Issue
          <ArrowRightIcon className="text-xs" />
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:gap-4">
      <p className="text-sm text-mauve-600">
        Build real software every week.{" "}
        <span className="font-bold text-mauve-900">Start your streak</span> by
        contributing to our open-source projects.
      </p>
      <Link
        href="https://github.com/DevDogsUGA"
        target="_blank"
        className="transition-lift hover:shadow-block-sm flex shrink-0 items-center gap-2 rounded-sm border-2 border-black bg-mauve-950 px-4 py-2 text-sm font-semibold text-white hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-cyan-400"
      >
        <GithubLogoIcon />
        DevDogs on GitHub
        <ArrowRightIcon className="text-xs" />
      </Link>
    </div>
  );
}
