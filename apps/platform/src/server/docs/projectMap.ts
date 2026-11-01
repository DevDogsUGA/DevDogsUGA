import { formatJson } from "~/server/config/formatJson";

/**
 * The project docs map, `.github/docs-projects.json`, as the platform reads
 * and writes it.
 *
 * The workflow reads the map with `.github/scripts/docs-projects.mjs`, which
 * has no dependencies because the publish job installs nothing. This is the
 * platform's copy of that validation, so the pull request an officer's toggle
 * opens can never contain a map the workflow would refuse. A test runs the
 * workflow's `validateMap` over everything written here; change the two
 * together.
 *
 * Version 2, keyed by project slug:
 *
 *     { "version": 2,
 *       "projects": { "<slug>": { "githubRepoId": "<decimal>",
 *                                 "ownerId": "<decimal>",
 *                                 "ownerLogin": "<login>" } } }
 *
 * The branch is always the default branch and the directory always `docs/`, so
 * neither is stored. Pure: nothing here reads a file, the network or the
 * database.
 */

export const PROJECT_MAP_PATH = ".github/docs-projects.json";
export const PROJECT_MAP_VERSION = 2;

/** A project's slug as the map allows it. */
export const MAP_SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;
/** A GitHub numeric id: a positive decimal that fits a bigint. */
export const GITHUB_ID = /^[1-9][0-9]{0,17}$/;
const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const KEYS = ["githubRepoId", "ownerId", "ownerLogin"] as const;

/** Slugs the club's own bundled docs use; a project can't take over their routes. */
export const RESERVED_DOCS_SLUGS: ReadonlySet<string> = new Set([
  "platform",
  "toolkit",
  "workshops",
  "schedule-builder",
  "operations",
  "_shared",
]);

/** One project's entry: the repository by id, and the owner an officer confirmed. */
export interface MapEntry {
  githubRepoId: string;
  ownerId: string;
  ownerLogin: string;
}

export interface ProjectMap {
  /** Carried through unchanged so an edit's diff is only the entry. */
  comment: string | undefined;
  projects: Record<string, MapEntry>;
}

/** Everything wrong with a parsed map, as lines; empty when the workflow would accept it. */
export function mapErrors(data: unknown): string[] {
  const errors: string[] = [];
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return ["the map must be a JSON object"];
  }
  const record = data as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!["version", "projects", "$comment"].includes(key)) {
      errors.push(`unknown top-level key "${key}"`);
    }
  }
  if (record.version !== PROJECT_MAP_VERSION) {
    errors.push(`"version" must be ${PROJECT_MAP_VERSION}`);
  }
  const projects = record.projects;
  if (
    typeof projects !== "object" ||
    projects === null ||
    Array.isArray(projects)
  ) {
    errors.push(`"projects" must be an object keyed by project slug`);
    return errors;
  }
  const repositories = new Map<string, string>();
  for (const [slug, entry] of Object.entries(projects)) {
    const at = `projects["${slug}"]`;
    if (!MAP_SLUG.test(slug)) {
      errors.push(
        `${at}: the slug must be lowercase letters, digits and hyphens`,
      );
    } else if (RESERVED_DOCS_SLUGS.has(slug)) {
      errors.push(`${at}: "${slug}" is reserved for the club's own docs`);
    }
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      errors.push(`${at} must be an object`);
      continue;
    }
    const e = entry as Record<string, unknown>;
    for (const key of Object.keys(e)) {
      if (!(KEYS as readonly string[]).includes(key)) {
        errors.push(`${at} has an unknown key "${key}"`);
      }
    }
    for (const key of KEYS) {
      if (typeof e[key] !== "string")
        errors.push(`${at}.${key} must be a string`);
    }
    const { githubRepoId, ownerId, ownerLogin } = e;
    if (typeof githubRepoId === "string") {
      if (!GITHUB_ID.test(githubRepoId)) {
        errors.push(
          `${at}.githubRepoId "${githubRepoId}" must be a decimal GitHub repository id`,
        );
      } else if (repositories.has(githubRepoId)) {
        errors.push(
          `${at}.githubRepoId "${githubRepoId}" is already used by "${repositories.get(githubRepoId)}"`,
        );
      } else {
        repositories.set(githubRepoId, slug);
      }
    }
    if (typeof ownerId === "string" && !GITHUB_ID.test(ownerId)) {
      errors.push(
        `${at}.ownerId "${ownerId}" must be a decimal GitHub account id`,
      );
    }
    if (typeof ownerLogin === "string" && !LOGIN.test(ownerLogin)) {
      errors.push(`${at}.ownerLogin "${ownerLogin}" isn't a GitHub login`);
    }
  }
  return errors;
}

export type ParsedMap =
  { ok: true; map: ProjectMap } | { ok: false; errors: string[] };

/** The map file's text as a `ProjectMap`, or what is wrong with it. */
export function parseProjectMap(text: string): ParsedMap {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, errors: ["the map isn't valid JSON"] };
  }
  const errors = mapErrors(data);
  if (errors.length > 0) return { ok: false, errors };
  const record = data as {
    $comment?: unknown;
    projects: Record<string, MapEntry>;
  };
  return {
    ok: true,
    map: {
      comment:
        typeof record.$comment === "string" ? record.$comment : undefined,
      projects: Object.fromEntries(
        Object.entries(record.projects).map(([slug, e]) => [
          slug,
          {
            githubRepoId: e.githubRepoId,
            ownerId: e.ownerId,
            ownerLogin: e.ownerLogin,
          },
        ]),
      ),
    },
  };
}

/**
 * The map as the file's text: formatted the way Prettier formats the committed
 * file (so `prettier --check` passes in the repository), entries sorted by slug
 * so two proposals never reorder each other's lines.
 */
export function serializeProjectMap(map: ProjectMap): string {
  return formatJson({
    ...(map.comment === undefined ? {} : { $comment: map.comment }),
    version: PROJECT_MAP_VERSION,
    projects: Object.fromEntries(
      Object.entries(map.projects).sort(([a], [b]) => (a < b ? -1 : 1)),
    ),
  });
}

/** The map with `slug` added or replaced. */
export function withProject(
  map: ProjectMap,
  slug: string,
  entry: MapEntry,
): ProjectMap {
  return { ...map, projects: { ...map.projects, [slug]: entry } };
}

/** The map without `slug`. */
export function withoutProject(map: ProjectMap, slug: string): ProjectMap {
  return {
    ...map,
    projects: Object.fromEntries(
      Object.entries(map.projects).filter(([key]) => key !== slug),
    ),
  };
}

/** The entry for `slug`, from the map's own entries only. */
export function entryFor(map: ProjectMap, slug: string): MapEntry | null {
  return Object.hasOwn(map.projects, slug) ? map.projects[slug]! : null;
}

/** Whether two entries name the same repository and the same confirmed owner. */
export function sameEntry(a: MapEntry, b: MapEntry): boolean {
  return (
    a.githubRepoId === b.githubRepoId &&
    a.ownerId === b.ownerId &&
    a.ownerLogin.toLowerCase() === b.ownerLogin.toLowerCase()
  );
}
