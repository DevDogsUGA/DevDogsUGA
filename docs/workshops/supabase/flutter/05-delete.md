---
name: "Deleting Your Own Messages"
description: "Let people delete only their own messages, enforced by a row-level security policy."
order: 5
---

<!-- Generated from Backstage apps/slides/decks/2026-09-28-supabase.md by `pnpm export:md`; edit the deck, not this file. -->

# Deleting Your Own Messages

<!-- prettier-ignore-start -->

<details>
<summary>Behind? Start from where the last step ended</summary>

These put your copy of the workshop code exactly where the previous step left it.

```bash cwd=~/Mobile-Workshops
# Get the checkpoint tags
git fetch origin --tags
# Throws away your changes to the workshop code
git switch --detach --discard-changes demo/04-profiles
```

</details>

## Let Users Delete Their Own Messages

**Dashboard → SQL Editor**:

One more policy, at the end.

Signed-in users can delete a message only when it's theirs. There's no update policy, on purpose.

```diff file=supabase/migrations/20260928000000_guestbook.sql lang=sql
--- a/supabase/migrations/20260928000000_guestbook.sql
+++ b/supabase/migrations/20260928000000_guestbook.sql
@@ -27,3 +27,11 @@
   for insert
   to authenticated
   with check (auth.uid() = user_id);
+
+-- Signed-in users can remove their own messages. There is no update
+-- policy: we only support post-and-delete for this workshop.
+create policy "authenticated users can delete their own messages"
+  on public.messages
+  for delete
+  to authenticated
+  using (auth.uid() = user_id);
```

[The whole `supabase/migrations/20260928000000_guestbook.sql` at this point](https://github.com/DevDogsUGA/Web-Workshops/blob/9c96784c95f0f1afc8ebf730e98106a3471c3dc6/supabase/migrations/20260928000000_guestbook.sql)

## Only Your Own Delete Button

Deleting takes a handler and a button, shown only on your own messages.

`_delete` removes the row, then reloads the list.

```diff file=lib/guestbook.dart lang=dart
--- a/lib/guestbook.dart
+++ b/lib/guestbook.dart
@@ -10,7 +10,9 @@
 String get _redirectTo =>
     kIsWeb ? Uri.base.origin : 'org.devdogsuga.mobileworkshops://login-callback';

-/// The guestbook, now backed by Supabase instead of an in-memory list.
+/// The guestbook, backed by Supabase instead of an in-memory list. The
+/// display name for each message comes from `public.profiles`, looked up
+/// server-side -- the client never sends its own name.
 class Guestbook extends StatefulWidget {
   const Guestbook({super.key});

@@ -85,6 +87,11 @@
     await _loadMessages();
   }

+  Future<void> _delete(String id) async {
+    await _supabase.from('messages').delete().eq('id', id);
+    await _loadMessages();
+  }
+
   @override
   Widget build(BuildContext context) {
     final session = _session;
```

`isOwnMessage` compares the signed-in user to the message's author; only then does the tile get a delete button.

```diff file=lib/guestbook.dart lang=dart
--- a/lib/guestbook.dart
+++ b/lib/guestbook.dart
@@ -129,6 +136,7 @@
                 itemCount: _messages.length,
                 itemBuilder: (context, index) {
                   final message = _messages[index];
+                  final isOwnMessage = session?.user.id == message['user_id'];
                   // Embedded from public.profiles via the messages ->
                   // profiles foreign key. messages.user_id -> profiles.id is
                   // many-to-one, so PostgREST returns a single object here
@@ -139,7 +147,12 @@
                   return ListTile(
                     title: Text(authorName),
                     subtitle: Text(message['body'] as String),
-                    trailing: Text(_formatTime(message['created_at'] as String)),
+                    trailing: isOwnMessage
+                        ? IconButton(
+                            icon: const Icon(Icons.delete_outline),
+                            onPressed: () => _delete(message['id'] as String),
+                          )
+                        : Text(_formatTime(message['created_at'] as String)),
                   );
                 },
               ),
```

[The whole `lib/guestbook.dart` at this point](https://github.com/DevDogsUGA/Mobile-Workshops/blob/0071976d48b00aa6f2786ac792f0273fae469f7d/lib/guestbook.dart)

<!-- prettier-ignore-end -->
