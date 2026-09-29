import { after, NextResponse, type NextRequest } from "next/server";
import {
  ApplicationCommandType,
  InteractionContextType,
  InteractionResponseType,
  InteractionType,
  MessageFlags,
  PermissionFlagsBits,
  Routes,
  type APIApplicationCommand,
  type APIInteraction,
  type APIMessageApplicationCommandInteraction,
  type RESTPutAPIApplicationGuildCommandsJSONBody,
} from "discord-api-types/v10";
import { verifyKey } from "discord-interactions";
import { eq, inArray } from "drizzle-orm";
import { env } from "~/env";
import { asBot } from "~/server/discord/api";
import { db } from "~/server/db";
import { supportForumPosts } from "~/server/db/schema";
import { SUPPORT_TAGS, supportConfig, type SupportConfig } from "./config";
import {
  deleteMessage,
  deleteThread,
  getForumTags,
  getMessage,
  getThread,
  tagId,
  updateThread,
  withStatusTag,
} from "./forum";
import { setForumAnswer, upsertForumPost } from "./forumIndex";
import { blockGuestByMessage, threadsStartedBy } from "./identity";

/**
 * The officers' side of the widget: two message commands (right-click a
 * message, Apps) on the bot's interactions endpoint.
 *
 * Both are gated twice. `default_member_permissions` hides them from anyone
 * without Manage Threads, and the handler re-checks the invoking member's
 * permissions from the signed payload, because a server admin can override
 * command visibility per role and the payload is what Discord vouches for.
 */
const MARK_AS_ANSWER = "Mark as answer";
const BLOCK_GUEST = "Block guest";

const COMMANDS: RESTPutAPIApplicationGuildCommandsJSONBody = [
  MARK_AS_ANSWER,
  BLOCK_GUEST,
].map((name) => ({
  name,
  type: ApplicationCommandType.Message,
  default_member_permissions: String(PermissionFlagsBits.ManageThreads),
  contexts: [InteractionContextType.Guild],
}));

/**
 * Registers the two commands on the guild if they are missing. Guild-scoped
 * so a change shows up at once rather than after global propagation. Reads
 * first and writes only on a difference: the bulk PUT replaces this bot's
 * whole guild command set, and command creation is rate limited per day, so
 * this is safe to call from a cron without spending that budget.
 */
export async function ensureSupportCommands(): Promise<boolean> {
  const app = (await asBot().get(Routes.currentApplication())) as { id: string };
  const route = Routes.applicationGuildCommands(app.id, env.DISCORD_GUILD_ID);
  const existing = (await asBot().get(route)) as APIApplicationCommand[];
  const names = new Set(existing.map((command) => command.name));
  if (COMMANDS.every((command) => names.has(command.name))) return false;
  await asBot().put(route, { body: COMMANDS });
  return true;
}

function ephemeral(content: string) {
  return NextResponse.json({
    type: InteractionResponseType.ChannelMessageWithSource,
    data: { content, flags: MessageFlags.Ephemeral },
  });
}

/**
 * POST /discord/interactions. Verifies Discord's signature, answers the
 * PING handshake, and runs the two support commands. Both do several
 * Discord round trips, well past the three seconds Discord waits for a
 * response, so they defer (an ephemeral "thinking…") and finish in `after`,
 * editing the deferred reply with the outcome.
 */
export async function handleInteraction(request: NextRequest): Promise<Response> {
  const signature = request.headers.get("x-signature-ed25519");
  const timestamp = request.headers.get("x-signature-timestamp");
  const raw = await request.text();
  if (
    !signature ||
    !timestamp ||
    !(await verifyKey(raw, signature, timestamp, env.DISCORD_PUBLIC_KEY).catch(
      () => false,
    ))
  ) {
    return new NextResponse("Invalid request signature.", { status: 401 });
  }

  const interaction = JSON.parse(raw) as APIInteraction;
  if (interaction.type === InteractionType.Ping) {
    return NextResponse.json({ type: InteractionResponseType.Pong });
  }

  const config = supportConfig();
  if (
    !config ||
    interaction.type !== InteractionType.ApplicationCommand ||
    interaction.data.type !== ApplicationCommandType.Message
  ) {
    return ephemeral("This command is not available here.");
  }
  const command = interaction as APIMessageApplicationCommandInteraction;

  const permissions = BigInt(command.member?.permissions ?? "0");
  if ((permissions & PermissionFlagsBits.ManageThreads) === 0n) {
    return ephemeral("Only officers can use this.");
  }

  const run =
    command.data.name === MARK_AS_ANSWER
      ? markAsAnswer
      : command.data.name === BLOCK_GUEST
        ? blockGuest
        : null;
  if (!run) return ephemeral("Unknown command.");

  after(async () => {
    const outcome = await run(config, command).catch((error: unknown) => {
      console.error("[support] interaction failed", error);
      return "Something went wrong. Check the logs, or try again.";
    });
    await asBot()
      .patch(Routes.webhookMessage(command.application_id, command.token), {
        body: { content: outcome },
        auth: false,
      })
      .catch((error: unknown) =>
        console.error("[support] could not edit the deferred reply", error),
      );
  });

  return NextResponse.json({
    type: InteractionResponseType.DeferredChannelMessageWithSource,
    data: { flags: MessageFlags.Ephemeral },
  });
}

/**
 * Pins the message, records it as the post's answer in the index, and marks
 * the post Resolved. With the FAQ tag also on the post, that is what
 * publishes it to Cmd-K and /help.
 */
async function markAsAnswer(
  config: SupportConfig,
  command: APIMessageApplicationCommandInteraction,
): Promise<string> {
  const threadId = command.channel.id;
  const thread = await getThread(threadId);
  if (!thread || thread.parent_id !== config.forumId) {
    return "Mark as answer only works inside a support forum post.";
  }
  const answer = command.data.resolved.messages[command.data.target_id];
  if (!answer) return "Discord did not send the message; try again.";

  const tags = await getForumTags(config);
  const starter = await getMessage(threadId, threadId);
  await upsertForumPost(thread, starter, tags);
  await setForumAnswer(threadId, answer);

  await asBot().put(Routes.channelMessagesPin(threadId, answer.id)).catch(
    (error: unknown) => console.error("[support] pin failed", error),
  );
  await updateThread(threadId, {
    tagIds: withStatusTag(tags, thread.applied_tags ?? [], "resolved"),
  });
  await db
    .update(supportForumPosts)
    .set({ isResolved: true })
    .where(eq(supportForumPosts.threadId, threadId));

  const faq = tagId(tags, SUPPORT_TAGS.faq);
  return faq && (thread.applied_tags ?? []).includes(faq)
    ? "Marked as the answer. This post is tagged FAQ, so it is now public in site search."
    : `Marked as the answer. Add the ${SUPPORT_TAGS.faq} tag to publish it in site search.`;
}

/**
 * Blocks the guest behind a relayed message: their token stops working, the
 * posts they started are deleted, and so is the message itself. A member's
 * message is refused -- members are moderated through the platform's own
 * reports and suspensions, not from Discord.
 */
async function blockGuest(
  _config: SupportConfig,
  command: APIMessageApplicationCommandInteraction,
): Promise<string> {
  const messageId = command.data.target_id;
  const guestId = await blockGuestByMessage(messageId);
  if (!guestId) {
    return "That message was not sent by a docs guest, so there is nobody to block.";
  }

  const threads = await threadsStartedBy(guestId);
  await Promise.all(threads.map((threadId) => deleteThread(threadId)));
  if (threads.length > 0) {
    await db
      .delete(supportForumPosts)
      .where(inArray(supportForumPosts.threadId, threads));
  }
  if (!threads.includes(command.channel.id)) {
    await deleteMessage(command.channel.id, messageId);
  }

  return threads.length > 0
    ? `Guest blocked. Deleted ${threads.length} post${threads.length === 1 ? "" : "s"} they started.`
    : "Guest blocked and the message deleted.";
}
