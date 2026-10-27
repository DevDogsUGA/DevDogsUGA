import "./community.css";

import Link from "next/link";
import { Button } from "~/ui/button";
import Field from "~/ui/field";
import { Input } from "~/ui/input";
import Pagination from "~/ui/pagination";
import { Checkbox } from "~/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "~/ui/avatar";
import { Card } from "~/ui/card";
import { profilePath } from "~/lib/profilePath";
import {
  academicsLine,
  directoryHref,
  isFiltered,
  type DirectoryQuery,
} from "~/lib/directoryQuery";
import type {
  DirectoryFacets,
  DirectoryPage,
} from "~/server/loaders/publicProfiles";
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
      <Avatar size="md">
        {/* A missing object 404s and Radix falls back to the monogram, the
            same way the leadership headshots do. */}
        {avatarSrc && <AvatarImage src={avatarSrc} alt="" />}
        <AvatarFallback>{initials(name)}</AvatarFallback>
      </Avatar>
      <div className="cm-mid">
        <p className="cm-name">{name}</p>
        {detail && <p className="cm-detail">{detail}</p>}
      </div>
    </>
  );

  if (!href)
    return (
      <Card className="cm-person" flat>
        {body}
      </Card>
    );
  return (
    <Card as={Link} href={href} className="cm-person">
      {body}
    </Card>
  );
}

interface Props {
  officers: LeaderProfile[];
  /** Officer user id -> handle, for the officers who have a public profile. */
  officerHandles: ReadonlyMap<string, string>;
  directory: DirectoryPage;
  query: DirectoryQuery;
  facets: DirectoryFacets;
}

/**
 * The public directory: the board first (on the unfiltered first page), then
 * the members who chose to be listed, searchable, filterable and paged.
 *
 * Officers are always shown, because the board is public on the homepage, but
 * they link to a profile only when they have a public one. In the unfiltered
 * directory the loader leaves them out of the member list, so nobody appears
 * twice and pagination counts only what the list shows.
 *
 * The filter bar is a plain GET form: it works without JavaScript and every
 * result is a shareable URL.
 */
export default function CommunityDirectory({
  officers,
  officerHandles,
  directory,
  query,
  facets,
}: Props) {
  const filtered = isFiltered(query);
  const showBoard = !filtered && directory.page === 1 && officers.length > 0;
  const { members, total, page, totalPages } = directory;

  return (
    <div className="wrap cm-wrap">
      {showBoard && (
        <section aria-labelledby="community-leadership">
          <div className="cm-head">
            <h2 id="community-leadership">Leadership</h2>
          </div>
          <ul className="cm-grid">
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
        <div className="cm-head">
          <h2 id="community-members">{filtered ? "Results" : "Members"}</h2>
          {total > 0 && (
            <div className="cm-count" role="status">
              <b>{total}</b> community {total === 1 ? "profile" : "profiles"}
            </div>
          )}
        </div>

        <form
          className="cm-filters"
          method="get"
          action="/community"
          role="search"
          aria-label="Search the community"
        >
          <Field label="Name or handle" htmlFor="cm-q">
            <Input
              id="cm-q"
              name="q"
              type="search"
              defaultValue={query.q}
              maxLength={64}
              placeholder="Search"
              autoComplete="off"
            />
          </Field>
          <Field label="Major" htmlFor="cm-major">
            <span className="input select">
              <select
                id="cm-major"
                name="major"
                defaultValue={query.major ?? ""}
              >
                <option value="">Any major</option>
                {facets.majors.map((major) => (
                  <option key={major} value={major}>
                    {major}
                  </option>
                ))}
              </select>
            </span>
          </Field>
          <Field label="Graduation year" htmlFor="cm-year">
            <span className="input select">
              <select
                id="cm-year"
                name="year"
                defaultValue={query.year === null ? "" : String(query.year)}
              >
                <option value="">Any year</option>
                {facets.years.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </span>
          </Field>
          <Checkbox
            name="leadership"
            value="1"
            label="Leadership only"
            defaultChecked={query.leadership}
            wrapperClassName="cm-filter-check"
          />
          <div className="cm-filter-actions">
            <Button type="submit" variant="outline">
              Search
            </Button>
            {filtered && (
              <Link className="textlink" href="/community">
                Clear
              </Link>
            )}
          </div>
        </form>

        {members.length === 0 ? (
          <Card flat>
            <p className="cm-empty">
              {filtered
                ? "No one matches that search. Try fewer filters or a shorter name."
                : "No members have made their profile public yet. Verify your account and turn on a public profile from your account page to be the first."}
            </p>
          </Card>
        ) : (
          <ul className="cm-grid">
            {members.map((member) => (
              <li key={member.handle}>
                <PersonCard
                  name={member.displayName ?? `@${member.handle}`}
                  avatarSrc={member.avatarUrl}
                  detail={academicsLine(member) ?? member.bio}
                  href={profilePath(member.handle)}
                />
              </li>
            ))}
          </ul>
        )}

        <Pagination
          page={page}
          totalPages={totalPages}
          totalCount={total}
          label="profiles"
          buildHref={(n) => directoryHref(query, n)}
        />
      </section>
    </div>
  );
}
