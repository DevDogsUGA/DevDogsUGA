---
name: Support widget
description: How the docs help widget bridges to the #tech-support Discord forum — where messages live, how guests work, what officers do in Discord, and what an environment needs before the widget turns on.
order: 5
section: guides
---

# Support widget

The chat launcher in the corner of every docs page is a front end for the
Discord server's `#tech-support` forum. A question asked in the widget becomes
a forum post; officers answer it in Discord; the answer shows up in the
widget. It is an inbox, not a live chat: the panel says replies usually take a
few hours, and a visitor who leaves finds the reply waiting when they come
back.

The code lives in `apps/platform/src/server/support` (server),
`apps/platform/src/components/SupportWidget` (client) and the route handlers
under `apps/platform/src/app/(api)/support`.

## Discord is the message store

Nothing on the platform stores what anyone said. Each time the widget opens a
conversation, and on every poll while it stays open, the route handler reads
the forum thread through the bot and maps the messages for display. Edits,
deletions and officer replies made in Discord show up with nothing to sync.

Polls don't each cost a Discord call. `server/support/sharedCache.ts` keeps
one snapshot of the forum's active posts for five seconds, shared through the
Workers Cache API by every request in a Cloudflare data center. Each post's
last message id in that snapshot tells a poll whether anything changed, and a
thread's messages are only refetched when it has, cached under that id. Edits
and new reactions don't move the id, so they can take up to a minute to
appear. The widget polls every 10 seconds while a conversation is active and
backs off to 30 and then 60 seconds once it goes quiet. A visitor's own write
evicts the snapshot so they see their message at once.

Postgres holds only what Discord can't:

| Table                  | Holds                                                                            |
| ---------------------- | -------------------------------------------------------------------------------- |
| `supportConversations` | Which visitor is in which thread (asker or follower), and how far they have read |
| `supportMessages`      | Which relayed message came from which visitor                                    |
| `supportGuests`        | Guest tokens, hashed, with a block flag and a last-seen time                     |
| `supportForumPosts`    | An anonymized search index over the whole forum                                  |

All four are server-only: RLS is on with no permissive policy, so only the
route handlers, connecting as the owner, can touch them.

Visitor messages reach Discord through a webhook on the forum, not the bot,
because a webhook message can carry any display name and avatar. That is how a
visitor's words appear in the thread as `Sam (via docs)`. The bot does
everything else: reading threads, changing tags, archiving and deleting.

## Guests

People can ask without signing in. A guest is **not** a Supabase user. It's a
random token in an httpOnly cookie scoped to `/support`, stored as a SHA-256
hash. Keeping guests out of `auth.users` keeps them out of every RLS policy
granted to `authenticated` and every `requireSession` check, none of which
were written with a guest in mind.

A guest's first post passes Cloudflare Turnstile, and nothing after it does.
The server accepts a pass only if siteverify echoes the `support_guest`
action and the hostname of `BASE_URL`. Staging and production share one
widget, so a token solved on one is refused by the other. Cloudflare's test
keys are accepted only when `DEPLOY_ENV` is development.
Rate limits (`consumeRateLimit`) cap posts per visitor and new guests per IP.
Nothing a visitor types can ping anyone: every relayed message sets
`allowed_mentions` to none.

When a guest signs in, the next support request moves their conversations
onto the account and clears the cookie. Guests who never come back are
deleted 90 days after their last visit. Their Discord posts stay.

## Getting notified

Right after posting, the widget offers **Link Discord**. Linking puts the
member in the server (the platform's Discord link already does `guilds.join`)
and adds them to their threads, so Discord itself notifies them of replies. For
a guest the same button signs them in with UGA Google first. There is no email
or push notification.

## Rendering Discord messages

`DiscordMarkdown` and `Message` render everything the message payload
carries: markdown, code blocks, spoilers, custom emoji, stickers, embeds,
reply references, polls, and reactions (read-only). Officer badges and role
names come from Postgres (`isLeader` and the synced roles), not Discord.

Anything that would need a second Discord request, like a channel mention,
falls back to the visitor's next step: **Sign in**, then **Link Discord**, then
**View in Discord**.

## For officers

Work happens in `#tech-support` as usual. Widget posts are the ones by
`… (via docs)`.

- **Answer in the thread.** Anyone can reply. The widget badges officers.
- **Right-click a message → Apps → Mark as answer.** This pins it, records it
  as the answer and tags the post Resolved.
- **Tag a post `FAQ`** once it has a marked answer, and it is published,
  anonymized, at `/help/<post id>` and in Cmd-K's "Answered questions".
  Mentions are stripped and there is no author, but read the question and
  answer before tagging.
- **Tag `Duplicate` and link the original** (`#post` mention or a
  `discord.com/channels/…` link). The widget sends the visitor there and
  shows the post as closed.
- **Right-click a guest's message → Apps → Block guest.** This revokes their
  token and deletes the posts they started. It refuses members' messages;
  members are moderated through the platform.

There is no Open tag. A post is open unless it has `Resolved` or `Duplicate`,
so posts members start in Discord need nothing added. Resolving from either
side works. If a visitor replies to a closed post, it reopens: both closing
tags come off and the thread is unarchived.

## Turning it on in an environment

The widget renders nothing, and every `/support` route 404s, until an
environment has both `DISCORD_SUPPORT_FORUM_ID` and
`DISCORD_SUPPORT_WEBHOOK_URL`. Guests additionally need
`TURNSTILE_SECRET_KEY` and `NEXT_PUBLIC_TURNSTILE_SITE_KEY`. Locally those two
default to Cloudflare's always-pass test keys.

Everything that needs setting up once:

1. Forum tags named `Resolved`, `Duplicate` and `FAQ` on the forum,
   plus optional tags named after docs projects (`Platform`, `Workshops`, …),
   which new posts get automatically. Tags are matched by name.
2. The bot needs View Channel, Read Message History, Send Messages in Threads,
   Manage Threads, Manage Messages and Pin Messages on the forum.
3. A webhook on the forum, stored as `DISCORD_SUPPORT_WEBHOOK_URL`.
4. A Turnstile widget for the site's hostname in the Cloudflare dashboard.
5. The Discord application's Interactions Endpoint URL set to
   `https://<host>/discord/interactions`. The message commands register
   themselves on the next `/cron/support` run.
6. Run `/cron/support?backfill=1` once to index the forum's history.

Point staging at a scratch forum, never the real one. Staging's test posts
would land in front of members.
