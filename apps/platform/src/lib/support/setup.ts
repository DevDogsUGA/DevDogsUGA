/**
 * The visitor's setup, as forum tags: which stack the page they asked from
 * is about, and which platform the docs are showing them. Shared by the
 * compose view, which shows the tags before posting so a wrong guess can be
 * removed, and the route that applies them.
 *
 * Tags are matched by name against the forum's own (see SUPPORT_TAGS), so a
 * forum without a "Flutter" tag simply gets no stack tag.
 *
 * Three automatic tags at most (project, stack, platform) on purpose:
 * Discord caps a post at five, and Resolved and FAQ need the other two.
 */

export const STACK_TAGS = {
  nextjs: "Next.js",
  flutter: "Flutter",
} as const;

/** One per docs platform variant (`data-os`), short enough for Discord's tag bar. */
export const OS_TAGS = {
  macos: "macOS",
  linux: "Linux",
  wsl: "WSL",
  windows: "Windows",
} as const;

export type Stack = keyof typeof STACK_TAGS;
export type Os = keyof typeof OS_TAGS;

export interface SetupTags {
  stack: Stack | null;
  os: Os | null;
}

/** Docs projects built on one stack. Workshops teach both; see `stackOf`. */
const PROJECT_STACKS: Record<string, Stack> = {
  platform: "nextjs",
  "schedule-builder": "nextjs",
  "study-group-finder": "flutter",
};

/**
 * The stack a docs page is about: the project's own, or for a workshop, the
 * track in its path (`/docs/workshops/supabase/flutter/...`). Null off docs
 * and on pages that serve both stacks.
 */
export function stackOf(path: string): Stack | null {
  const [docs, project, ...rest] = path.split("/").filter(Boolean);
  if (docs !== "docs" || !project) return null;
  if (Object.hasOwn(PROJECT_STACKS, project)) return PROJECT_STACKS[project]!;
  return rest.find((s): s is Stack => Object.hasOwn(STACK_TAGS, s)) ?? null;
}

export function isOs(value: string | null | undefined): value is Os {
  return typeof value === "string" && Object.hasOwn(OS_TAGS, value);
}
