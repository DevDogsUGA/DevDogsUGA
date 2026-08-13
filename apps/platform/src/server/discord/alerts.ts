import { Routes } from "discord-api-types/v10";
import { asBot } from "./api";
import { env } from "~/env";

/**
 * Operational alerts to a Discord channel.
 *
 * For the failures nobody is watching for. A background pass that refuses is
 * safe — it declined to write bad data — but it is also silent, and the cost of
 * silence compounds: data stops flowing and the first person to notice is
 * whoever needed it.
 *
 * Deliberately not a general logging channel. Anything posted here should be
 * something a specific person has to go and fix, or the channel becomes
 * scenery.
 */

/**
 * Sends an alert, or does nothing if no channel is configured.
 *
 * NEVER THROWS. This is called from inside passes whose actual job is
 * something else, and an alert that fails must not turn a handled refusal into
 * an unhandled exception -- that would convert a working guard into an outage,
 * which is the opposite of the point.
 */
export async function postAlert(
  title: string,
  lines: string[],
  footer?: string,
): Promise<void> {
  // Empty means "not configured", the same convention `AIRTABLE_BASE_ID` and
  // `GITHUB_WEBHOOK_SECRET` use. Local development and any environment that
  // has not opted in stay silent rather than posting into the club's real
  // Discord -- staging shares the production guild, so this is not theoretical.
  if (!env.DISCORD_ALERT_CHANNEL_ID) return;

  const body = [
    `**${title}**`,
    ...lines.map((l) => `• ${l}`),
    ...(footer ? ["", footer] : []),
  ].join("\n");

  try {
    await asBot().post(Routes.channelMessages(env.DISCORD_ALERT_CHANNEL_ID), {
      body: {
        content: body.slice(0, 2000),
        // No role or user pings. An alert that pings on every occurrence is one
        // people mute, and a muted channel is worse than no channel because it
        // still looks like coverage.
        allowed_mentions: { parse: [] },
      },
    });
  } catch (e) {
    console.error("[alerts] failed to post to Discord", e);
  }
}
