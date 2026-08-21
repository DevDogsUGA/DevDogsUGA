import Link from "next/link";
import { ArrowRightIcon, LightbulbIcon } from "@phosphor-icons/react/ssr";
import { SUGGEST_PROJECT_FORM_URL } from "~/config/projects";

/**
 * The odd card out in the projects grid: not a project, but the prompt that
 * makes one. Solid cyan against the white cards beside it — the same fill the
 * nav's primary Join button uses — while keeping the border, radius, and block
 * shadow so it still reads as one of the set rather than an ad dropped in.
 *
 * Until {@link SUGGEST_PROJECT_FORM_URL} is filled in, the button renders
 * disabled rather than linking somewhere dead.
 */
export default function SuggestProjectCard() {
  return (
    <div className="shadow-block-lg flex h-full flex-col gap-4 rounded-sm border-2 border-black bg-cyan-400 p-6">
      <span className="flex size-10 items-center justify-center rounded-sm border-2 border-black bg-white text-xl text-black">
        <LightbulbIcon />
      </span>
      <div className="space-y-1">
        <h3 className="font-display text-2xl font-bold text-black">
          Have an idea?
        </h3>
        <p className="text-sm font-semibold text-cyan-950">Suggest a Project</p>
      </div>
      <p className="text-sm/relaxed text-cyan-950">
        Every project here started as somebody&rsquo;s suggestion. Tell us what
        you would build for UGA, and we&rsquo;ll bring it to the club.
      </p>
      <div className="mt-auto flex justify-end border-t border-black/20 pt-4">
        {SUGGEST_PROJECT_FORM_URL ? (
          <Link
            href={SUGGEST_PROJECT_FORM_URL}
            target="_blank"
            className="transition-lift hover:shadow-block-sm flex shrink-0 items-center gap-2 rounded-sm border-2 border-black bg-black px-4 py-2 text-sm font-semibold text-white hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-white"
          >
            Submit an Idea
            <ArrowRightIcon className="text-xs" />
          </Link>
        ) : (
          <button
            type="button"
            disabled
            className="flex shrink-0 cursor-not-allowed items-center gap-2 rounded-sm border-2 border-black/40 bg-cyan-300 px-4 py-2 text-sm font-semibold text-cyan-950/70"
          >
            Form Coming Soon
          </button>
        )}
      </div>
    </div>
  );
}
