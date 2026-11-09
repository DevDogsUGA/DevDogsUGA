/**
 * One officer, as the cards render them.
 *
 * `~/server/loaders/officers.ts` shapes this out of `platform.profile` and the
 * leadership roles its holder has been given. It was a hand-maintained array of
 * object literals until 20260827000000, and three consequences of that move
 * show up in these types.
 *
 * `imageSrc` is a URL string rather than a `StaticImageData`, because the image
 * is no longer a build-time import from `~/assets`. It is the officer's avatar,
 * keyed by user id in the `avatars` bucket, and can 404. The blur placeholder a
 * static import used to carry is gone, because an avatar uploaded from /account
 * has none to carry.
 *
 * `links` replaced the fixed portfolio/github/linkedin/email fields. Members
 * curate `platform."profileLinks"` from /account, so a card shows whatever the
 * officer put there rather than four slots the data has to be bent into.
 * GitHub, Discord and LinkedIn are separately modelled as linked identities
 * gated on `showGithub`/`showDiscord`/`showLinkedin`, which this section does
 * not read yet.
 *
 * Everything optional is explicitly `| null` rather than `?`, because the
 * database distinguishes "no answer" from "not asked". No officer has stated
 * pronouns, and a card must render that as silence rather than as a gap in a
 * sentence.
 */
export interface LeaderProfile {
  /** The officer's user id, which is also their avatar's key. */
  slug: string;
  name: string;
  titles: string[];
  imageSrc: string | null;
  pronouns: string | null;
  year: string | null;
  programs: LeaderAcademicProgram[];
  /** `profile.roleDescription`. Null until the officer writes one. */
  bio: string | null;
  links: { title: string; url: string }[];
}

export type LeaderAcademicProgramType =
  | "major"
  | "masters_program"
  | "doctoral_program"
  | "graduate_program"
  | "minor"
  | "certificate"
  | "professional_program";

export interface LeaderAcademicProgram {
  name: string;
  type: LeaderAcademicProgramType;
}

/**
 * The line under a leader's name: pronouns, class year, or both.
 *
 * Built by filtering rather than interpolating, because for this board most of
 * it is missing. Nobody stated pronouns and one officer of seven gave a
 * graduation year, so the template this replaced, `{pronouns} · Class of
 * {year}`, would have rendered a bare " · Class of " under six names. Empty
 * string means the caller omits the element.
 */
export function formatLeaderMeta(
  pronouns: string | null,
  year: string | null,
): string {
  return [pronouns, year ? `Class of ${year}` : null]
    .filter(Boolean)
    .join(" · ");
}
