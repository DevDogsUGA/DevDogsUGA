import type { ClassicProfileActivity } from "~/classic/loaders/profileActivity";
import { ArrowSquareOutIcon, UserIcon } from "@phosphor-icons/react/ssr";
import { Avatar, AvatarFallback, AvatarImage } from "~/classic/ui/avatar";
import { ConsoleCard } from "~/classic/ui/card";
import PageShell from "~/classic/components/PageShell";
import { StarTotalsRow } from "~/classic/components/participation/StarBadges";
import type { PublicProfile as Profile } from "~/server/loaders/publicProfiles";
import { headingFor, linkItemsFor } from "./view";

const linkCls =
  "inline-flex items-center gap-1.5 rounded-sm underline underline-offset-2 outline-none hover:text-mauve-200 focus-visible:ring-2 focus-visible:ring-white";

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
  activity: ClassicProfileActivity;
}) {
  const heading = headingFor(profile);
  const links = linkItemsFor(profile, activity.links);
  const { stars } = activity;

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
    </PageShell>
  );
}
