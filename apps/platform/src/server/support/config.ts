import { env } from "~/env";

/**
 * Forum tag names the widget reads and writes. Discord tags are matched by
 * name (case-insensitively) against the forum's `available_tags`, so the ids
 * never live in code and an officer renaming a tag's emoji breaks nothing.
 * Renaming the tag itself does, which is why the names are here once.
 *
 * There is no Open tag: a post is open unless it carries Resolved or
 * Duplicate. Discord would never apply an Open tag to posts members start
 * there, and the forum's own active list already hides resolved posts,
 * which are archived.
 */
export const SUPPORT_TAGS = {
  resolved: "Resolved",
  duplicate: "Duplicate",
  faq: "FAQ",
} as const;

/** Guest data outlives its last visit by this long (see the retention cron). */
export const GUEST_RETENTION_DAYS = 90;

export interface SupportConfig {
  forumId: string;
  webhookUrl: string;
}

/**
 * The widget's Discord wiring, or null when this environment has none, which
 * turns the whole feature off: no launcher, and every support route 404s.
 * Both halves are required together; a forum without a webhook could read
 * threads but never post into them.
 */
export function supportConfig(): SupportConfig | null {
  const forumId = env.DISCORD_SUPPORT_FORUM_ID;
  const webhookUrl = env.DISCORD_SUPPORT_WEBHOOK_URL;
  if (!forumId || !webhookUrl) return null;
  return { forumId, webhookUrl };
}

/** Whether guests can post: they need Turnstile, members do not. */
export function guestsEnabled(): boolean {
  return Boolean(
    env.TURNSTILE_SECRET_KEY && env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  );
}
