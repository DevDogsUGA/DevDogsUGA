import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "~/ui/avatar";
import { COMMUNITY_PATH, profilePath } from "~/lib/profilePath";
import type { PublicProfileSummary } from "~/server/loaders/publicProfiles";
import type { LeaderProfile } from "~/components/LeadershipSection/LeaderCluster/profile";

/** "Jack Harrington" -> "JH"; "@ada" -> "A". */
function initials(name: string) {
  return (
    name
      .replace(/^@/, "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]!.toUpperCase())
      .join("") || "?"
  );
}

const CARD =
  "flex items-center gap-3 rounded-xl border bg-card p-4 text-card-foreground";
const LINKED_CARD =
  "transition-lift hover:shadow-block-md hover:-translate-x-0.5 hover:-translate-y-0.5";

interface PersonProps {
  /** Shown name: a display name, or `@handle` when the member hides theirs. */
  name: string;
  avatarSrc: string | null;
  /** Line under the name: an officer's titles, or a member's bio. */
  detail: string | null;
  /** Null renders an unlinked card (an officer without a public profile). */
  href: string | null;
}

function PersonCard({ name, avatarSrc, detail, href }: PersonProps) {
  const body = (
    <>
      <Avatar className="size-12">
        {/* A missing object 404s and Radix falls back to the monogram, the
            same way the leadership headshots do. */}
        {avatarSrc && <AvatarImage src={avatarSrc} alt="" />}
        <AvatarFallback className="font-display font-extrabold">
          {initials(name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="truncate font-semibold">{name}</p>
        {detail && (
          <p className="text-muted-foreground line-clamp-2 text-sm">{detail}</p>
        )}
      </div>
    </>
  );

  if (!href) return <div className={CARD}>{body}</div>;
  return (
    <Link href={href} className={`${CARD} ${LINKED_CARD}`}>
      {body}
    </Link>
  );
}

interface Props {
  officers: LeaderProfile[];
  /** Officer user id -> handle, for the officers who have a public profile. */
  officerHandles: ReadonlyMap<string, string>;
  members: PublicProfileSummary[];
}

/**
 * The public directory: the board first, then every other member who chose to
 * be listed.
 *
 * Officers are always shown, because the board is public on the homepage, but
 * they link to a profile only when they have a public one. They are removed
 * from the member list by handle, so nobody appears twice.
 */
export default function CommunityDirectory({
  officers,
  officerHandles,
  members,
}: Props) {
  const officerHandleSet = new Set(officerHandles.values());
  const others = members.filter((m) => !officerHandleSet.has(m.handle));

  return (
    <div className="flex flex-col gap-10">
      {officers.length > 0 && (
        <section aria-labelledby="community-leadership">
          <h2
            id="community-leadership"
            className="font-display mb-4 px-1 text-2xl font-extrabold"
          >
            Leadership
          </h2>
          <ul className="grid gap-3 @sm:grid-cols-2 @3xl:grid-cols-3">
            {officers.map((officer) => {
              const handle = officerHandles.get(officer.slug);
              return (
                <li key={officer.slug}>
                  <PersonCard
                    name={officer.name}
                    avatarSrc={officer.imageSrc}
                    detail={officer.titles.join(", ")}
                    href={handle ? profilePath(handle) : null}
                  />
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section aria-labelledby="community-members">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2 px-1">
          <h2
            id="community-members"
            className="font-display text-2xl font-extrabold"
          >
            Members
          </h2>
          <Link
            href={`${COMMUNITY_PATH}/competitions`}
            className="text-sm font-semibold underline underline-offset-2"
          >
            Competition archive
          </Link>
        </div>
        {others.length === 0 ? (
          <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm">
            No members have made their profile public yet. Verify your account
            and turn on a public profile from your account page to be the first.
          </p>
        ) : (
          <ul className="grid gap-3 @sm:grid-cols-2 @3xl:grid-cols-3">
            {others.map((member) => (
              <li key={member.handle}>
                <PersonCard
                  name={member.displayName ?? `@${member.handle}`}
                  avatarSrc={member.avatarUrl}
                  detail={member.bio}
                  href={profilePath(member.handle)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
