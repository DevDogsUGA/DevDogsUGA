import "~/components/CommunityDirectory/community.css";

import { ArrowSquareOutIcon, UserIcon } from "@phosphor-icons/react/ssr";
import { Avatar, AvatarFallback, AvatarImage } from "~/ui/avatar";
import { Breadcrumbs } from "~/ui/breadcrumbs";
import { Card } from "~/ui/card";
import BadgeList from "~/components/Badges/BadgeList";
import ContributionList from "~/components/Contributions";
import { StarTotalsRow } from "~/components/participation/StarBadges";
import { academicsLine } from "~/lib/directoryQuery";
import type {
  PublicProfile as Profile,
  PublicProfileActivity,
} from "~/server/loaders/publicProfiles";
import { headingFor, linkItemsFor } from "./view";

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
  const academics = academicsLine(profile);
  const links = linkItemsFor(profile, activity.links);
  const { stars, contributions, badges } = activity;

  return (
    <div className="wrap cm-profile-wrap">
      <div className="cm-profile">
        <Breadcrumbs
          items={[
            { label: "Community", href: "/community" },
            { label: `@${profile.handle}` },
          ]}
        />
        <div className="with-aside">
          <div className="min-w-0">
            <div className="cm-id">
              <Avatar size="lg" className="size-22 min-[721px]:size-28">
                {profile.avatarUrl && (
                  <AvatarImage src={profile.avatarUrl} alt="" />
                )}
                <AvatarFallback>
                  <UserIcon size={40} aria-hidden />
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <h1>{heading}</h1>
                {profile.displayName && (
                  <p className="cm-handle mono">@{profile.handle}</p>
                )}
                {academics && <p className="cm-academics">{academics}</p>}
                {profile.roleDescription && (
                  <p className="cm-role">{profile.roleDescription}</p>
                )}
                {profile.bio && <p className="cm-bio">{profile.bio}</p>}
                {links.length > 0 && (
                  <ul className="cm-links">
                    {links.map((link) => (
                      <li key={`${link.label}-${link.href}`}>
                        {link.href ? (
                          <a
                            className="textlink"
                            href={link.href}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ArrowSquareOutIcon size={14} weight="bold" />
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
            {badges.length > 0 && (
              <section
                id="badges"
                className="cm-badges"
                aria-labelledby="h-badges"
              >
                <Card>
                  <h2 id="h-badges" className="card-title">
                    Badges
                  </h2>
                  <BadgeList entries={badges} />
                </Card>
              </section>
            )}
            {contributions && (
              <section
                id="contributions"
                className="cm-contributions"
                aria-labelledby="h-contributions"
              >
                <Card>
                  <h2 id="h-contributions" className="card-title">
                    Contributions
                  </h2>
                  <ContributionList items={contributions} />
                </Card>
              </section>
            )}
          </div>
          {stars && (
            <aside>
              <section
                id="stars"
                className="cm-stars"
                aria-labelledby="h-stars"
              >
                <Card>
                  <h2 id="h-stars" className="card-title">
                    Stars
                  </h2>
                  <StarTotalsRow totals={stars} />
                </Card>
              </section>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
