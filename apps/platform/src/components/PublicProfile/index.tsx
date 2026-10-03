import Link from "next/link";
import { ArrowSquareOutIcon, UserIcon } from "@phosphor-icons/react/ssr";
import { Avatar, AvatarFallback, AvatarImage } from "~/ui/avatar";
import Badge from "~/ui/badge";
import { ConsoleCard } from "~/ui/card";
import PageShell from "~/components/PageShell";
import { StarTotalsRow } from "~/components/participation/StarBadges";
import type {
  PublicProfile as Profile,
  PublicProfileActivity,
} from "~/server/loaders/publicProfiles";
import { headingFor, linkItemsFor } from "./view";

const linkCls =
  "inline-flex items-center gap-1.5 rounded-sm underline underline-offset-2 outline-none hover:text-mauve-200 focus-visible:ring-2 focus-visible:ring-white";

const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * A member's public profile. Every section renders only when the loaders
 * returned it, so a profile that hides everything is the header alone.
 * Attendance, streak and reflections are not in the loaders and not here.
 */
export default function PublicProfile({
  profile,
  activity,
}: {
  profile: Profile;
  activity: PublicProfileActivity;
}) {
  const heading = headingFor(profile);
  const links = linkItemsFor(profile, activity.links);
  const { competitions, contributions, stars } = activity;

  return (
    <PageShell
      accent="amber"
      title={heading}
      description={
        profile.displayName ? (
          <span>@{profile.handle}</span>
        ) : (
          profile.roleDescription
        )
      }
    >
      <ConsoleCard.Root>
        <ConsoleCard.Content>
          <div className="flex flex-col gap-4 @sm:flex-row @sm:items-start">
            <Avatar className="size-24">
              {profile.avatarUrl && (
                <AvatarImage src={profile.avatarUrl} alt="" />
              )}
              <AvatarFallback>
                <UserIcon size={40} aria-hidden />
              </AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-col gap-3">
              {profile.displayName && profile.roleDescription && (
                <p className="text-sm font-semibold text-mauve-200">
                  {profile.roleDescription}
                </p>
              )}
              {profile.bio && (
                <p className="max-w-prose text-sm whitespace-pre-line text-mauve-300">
                  {profile.bio}
                </p>
              )}
              {links.length > 0 && (
                <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-mauve-300">
                  {links.map((link) => (
                    <li key={`${link.label}-${link.href}`}>
                      {link.href ? (
                        <a
                          href={link.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={linkCls}
                        >
                          <ArrowSquareOutIcon size={12} weight="bold" />
                          {link.label}
                        </a>
                      ) : (
                        link.label
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </ConsoleCard.Content>
      </ConsoleCard.Root>

      {stars && (
        <ConsoleCard.Root id="stars">
          <ConsoleCard.Header title="Stars" />
          <ConsoleCard.Content>
            <StarTotalsRow totals={stars} />
          </ConsoleCard.Content>
        </ConsoleCard.Root>
      )}

      {competitions && (
        <ConsoleCard.Root id="competitions">
          <ConsoleCard.Header title="Competitions" />
          <ConsoleCard.Content>
            {competitions.length === 0 ? (
              <p className="text-sm text-mauve-400">
                No competitions entered yet.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {competitions.map((entry) => (
                  <li
                    key={`${entry.competitionSlug}-${entry.teamSlug}`}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 p-4"
                  >
                    <span className="flex flex-col gap-0.5">
                      <Link
                        href={`/competitions/${entry.competitionSlug}`}
                        className="rounded-sm font-semibold text-white underline outline-none focus-visible:ring-2 focus-visible:ring-white"
                      >
                        {entry.competitionTitle}
                      </Link>
                      <span className="text-xs text-mauve-400">
                        with {entry.teamName},{" "}
                        {dateFormat.format(entry.enteredAt)}
                      </span>
                    </span>
                    {entry.won && (
                      <Link
                        href={`/competitions/${entry.competitionSlug}/results`}
                        aria-label={`${entry.competitionTitle} results`}
                      >
                        <Badge variant="success">Winner</Badge>
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </ConsoleCard.Content>
        </ConsoleCard.Root>
      )}

      {contributions && (
        <ConsoleCard.Root id="contributions">
          <ConsoleCard.Header title="Merged contributions" />
          <ConsoleCard.Content>
            {contributions.length === 0 ? (
              <p className="text-sm text-mauve-400">
                No merged pull requests yet.
              </p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {contributions.map((pr) => (
                  <li
                    key={`${pr.competitionSlug}-${pr.prNumber}`}
                    className="flex flex-wrap items-baseline gap-x-3 text-mauve-300"
                  >
                    <a
                      href={pr.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={linkCls}
                    >
                      PR #{pr.prNumber}
                    </a>
                    <span className="text-xs text-mauve-400">
                      {pr.competitionTitle}, {pr.teamName},{" "}
                      {dateFormat.format(pr.mergedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </ConsoleCard.Content>
        </ConsoleCard.Root>
      )}
    </PageShell>
  );
}
