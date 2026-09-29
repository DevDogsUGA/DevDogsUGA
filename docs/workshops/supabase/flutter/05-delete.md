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

```diff file=supabase/migrations/20260928000000_guestbook.sql lang=sql context=6 href=https://github.com/DevDogsUGA/Web-Workshops/compare/cd01fa1e5cad6019bb5315f8c30a960c6646fd39...9c96784c95f0f1afc8ebf730e98106a3471c3dc6#diff-5d1eb0c93f905e8db60c6bf0111f6a064ec9a44666f86a14842c382c1b354ae1
--- a/supabase/migrations/20260928000000_guestbook.sql
+++ b/supabase/migrations/20260928000000_guestbook.sql
@@ -1,29 +1,37 @@
 -- Guestbook messages table (workshop step 1 & 2: read, sign in, naive insert).
 --
 -- This is the "naive" version: the client sends its own display name with
 -- every message. Step 2 (profiles.sql) explains why that's a bad idea and
 -- fixes it.

 create table public.messages (
   id uuid primary key default gen_random_uuid(),
   user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
   author_name text not null,
   body text not null check (char_length(body) between 1 and 500),
   created_at timestamptz not null default now()
 );

 alter table public.messages enable row level security;

 -- Anyone (signed in or not) can read the guestbook.
 create policy "messages are readable by everyone"
   on public.messages
   for select
   to anon, authenticated
   using (true);

 -- Only signed-in users can post, and only under their own user id.
 create policy "authenticated users can insert their own messages"
   on public.messages
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

```diff file=lib/guestbook.dart lang=dart context=6 href=https://github.com/DevDogsUGA/Mobile-Workshops/compare/3b10b23bff5732a6487ba58887feab9a3d5c5f7c...0071976d48b00aa6f2786ac792f0273fae469f7d#diff-421311fd7986258c9b94592881ea0ebcdeb72cd931b1e96689ee04ac1c77d2ee
--- a/lib/guestbook.dart
+++ b/lib/guestbook.dart
@@ -1,161 +1,168 @@
 import 'package:flutter/foundation.dart' show kIsWeb;
 import 'package:flutter/material.dart';
 import 'package:supabase_flutter/supabase_flutter.dart';

 final _supabase = Supabase.instance.client;

 /// Where the OAuth provider should send the browser (web) or the app
 /// (mobile) back to once sign-in finishes. The scheme below is already
 /// registered in the Android/iOS deep-link setup from `01-flutter-intro`.
 String get _redirectTo =>
     kIsWeb ? Uri.base.origin : 'org.devdogsuga.mobileworkshops://login-callback';

-/// The guestbook, now backed by Supabase instead of an in-memory list.
+/// The guestbook, backed by Supabase instead of an in-memory list. The
+/// display name for each message comes from `public.profiles`, looked up
+/// server-side -- the client never sends its own name.
 class Guestbook extends StatefulWidget {
   const Guestbook({super.key});

   @override
   State<Guestbook> createState() => _GuestbookState();
 }

 class _GuestbookState extends State<Guestbook> {
   final _bodyController = TextEditingController();

   Session? _session;
   List<Map<String, dynamic>> _messages = [];

   @override
   void initState() {
     super.initState();

     // Keep track of whether anyone is signed in, and react to sign-in/out.
     _session = _supabase.auth.currentSession;
     _supabase.auth.onAuthStateChange.listen((data) {
       setState(() => _session = data.session);
     });

     _loadMessages();
   }

   @override
   void dispose() {
     _bodyController.dispose();
     super.dispose();
   }

   // Load the guestbook, newest first.
   Future<void> _loadMessages() async {
     try {
       final rows = await _supabase
           .from('messages')
           .select('id, user_id, body, created_at, profiles(name)')
           .order('created_at', ascending: false);
       if (mounted) {
         setState(() => _messages = List<Map<String, dynamic>>.from(rows));
       }
     } catch (error) {
       // The workshop's dev server might not be running yet -- don't crash
       // the whole screen over it.
       debugPrint('Could not load the guestbook: $error');
     }
   }

   Future<void> _signIn() {
     return _supabase.auth.signInWithOAuth(
       OAuthProvider('custom:devdogsuga'),
       redirectTo: _redirectTo,
     );
   }

   Future<void> _signOut() => _supabase.auth.signOut();

   Future<void> _submit() async {
     final body = _bodyController.text.trim();
     final session = _session;
     if (session == null || body.isEmpty) {
       return;
     }

     // The name is looked up server-side from public.profiles (set once, at
     // sign-up) -- we never send it from the client, so no one can post
     // under a name that isn't theirs.
     await _supabase.from('messages').insert({'body': body});

     _bodyController.clear();
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

     return Scaffold(
       appBar: AppBar(title: const Text('Guestbook')),
       body: Padding(
         padding: const EdgeInsets.all(16),
         child: Column(
           children: [
             Align(
               alignment: Alignment.centerLeft,
               child: session == null
                   ? ElevatedButton(
                       onPressed: _signIn,
                       child: const Text('Sign in with DevDogs'),
                     )
                   : OutlinedButton(
                       onPressed: _signOut,
                       child: const Text('Sign out'),
                     ),
             ),
             if (session != null) ...[
               const SizedBox(height: 8),
               TextField(
                 controller: _bodyController,
                 decoration: const InputDecoration(labelText: 'Leave a message'),
               ),
               const SizedBox(height: 8),
               ElevatedButton(
                 onPressed: _submit,
                 child: const Text('Sign the guestbook'),
               ),
             ] else
               const Padding(
                 padding: EdgeInsets.symmetric(vertical: 8),
                 child: Text('Sign in to leave a message. Anyone can read below.'),
               ),
             const Divider(height: 32),
             Expanded(
               child: ListView.builder(
                 itemCount: _messages.length,
                 itemBuilder: (context, index) {
                   final message = _messages[index];
                   // Embedded from public.profiles via the messages ->
                   // profiles foreign key. messages.user_id -> profiles.id is
                   // many-to-one, so PostgREST returns a single object here
                   // (or null) -- never a list.
                   final profile = message['profiles'] as Map<String, dynamic>?;
                   final authorName = profile?['name'] as String? ?? 'Unknown';

                   return ListTile(
                     title: Text(authorName),
                     subtitle: Text(message['body'] as String),
                     trailing: Text(_formatTime(message['created_at'] as String)),
                   );
                 },
               ),
             ),
           ],
         ),
       ),
     );
   }
 }

 /// Formats an ISO timestamp as HH:MM, zero-padded, for display next to a
 /// message.
 String _formatTime(String isoTimestamp) {
   final time = DateTime.parse(isoTimestamp).toLocal();
   final hour = time.hour.toString().padLeft(2, '0');
   final minute = time.minute.toString().padLeft(2, '0');
   return '$hour:$minute';
 }
```

`isOwnMessage` compares the signed-in user to the message's author; only then does the tile get a delete button.

```diff file=lib/guestbook.dart lang=dart context=6 href=https://github.com/DevDogsUGA/Mobile-Workshops/compare/3b10b23bff5732a6487ba58887feab9a3d5c5f7c...0071976d48b00aa6f2786ac792f0273fae469f7d#diff-421311fd7986258c9b94592881ea0ebcdeb72cd931b1e96689ee04ac1c77d2ee
--- a/lib/guestbook.dart
+++ b/lib/guestbook.dart
@@ -1,168 +1,174 @@
 import 'package:flutter/foundation.dart' show kIsWeb;
 import 'package:flutter/material.dart';
 import 'package:supabase_flutter/supabase_flutter.dart';

 final _supabase = Supabase.instance.client;

 /// Where the OAuth provider should send the browser (web) or the app
 /// (mobile) back to once sign-in finishes. The scheme below is already
 /// registered in the Android/iOS deep-link setup from `01-flutter-intro`.
 String get _redirectTo =>
     kIsWeb ? Uri.base.origin : 'org.devdogsuga.mobileworkshops://login-callback';

 /// The guestbook, backed by Supabase instead of an in-memory list. The
 /// display name for each message comes from `public.profiles`, looked up
 /// server-side -- the client never sends its own name.
 class Guestbook extends StatefulWidget {
   const Guestbook({super.key});

   @override
   State<Guestbook> createState() => _GuestbookState();
 }

 class _GuestbookState extends State<Guestbook> {
   final _bodyController = TextEditingController();

   Session? _session;
   List<Map<String, dynamic>> _messages = [];

   @override
   void initState() {
     super.initState();

     // Keep track of whether anyone is signed in, and react to sign-in/out.
     _session = _supabase.auth.currentSession;
     _supabase.auth.onAuthStateChange.listen((data) {
       setState(() => _session = data.session);
     });

     _loadMessages();
   }

   @override
   void dispose() {
     _bodyController.dispose();
     super.dispose();
   }

   // Load the guestbook, newest first.
   Future<void> _loadMessages() async {
     try {
       final rows = await _supabase
           .from('messages')
           .select('id, user_id, body, created_at, profiles(name)')
           .order('created_at', ascending: false);
       if (mounted) {
         setState(() => _messages = List<Map<String, dynamic>>.from(rows));
       }
     } catch (error) {
       // The workshop's dev server might not be running yet -- don't crash
       // the whole screen over it.
       debugPrint('Could not load the guestbook: $error');
     }
   }

   Future<void> _signIn() {
     return _supabase.auth.signInWithOAuth(
       OAuthProvider('custom:devdogsuga'),
       redirectTo: _redirectTo,
     );
   }

   Future<void> _signOut() => _supabase.auth.signOut();

   Future<void> _submit() async {
     final body = _bodyController.text.trim();
     final session = _session;
     if (session == null || body.isEmpty) {
       return;
     }

     // The name is looked up server-side from public.profiles (set once, at
     // sign-up) -- we never send it from the client, so no one can post
     // under a name that isn't theirs.
     await _supabase.from('messages').insert({'body': body});

     _bodyController.clear();
     await _loadMessages();
   }

   Future<void> _delete(String id) async {
     await _supabase.from('messages').delete().eq('id', id);
     await _loadMessages();
   }

   @override
   Widget build(BuildContext context) {
     final session = _session;

     return Scaffold(
       appBar: AppBar(title: const Text('Guestbook')),
       body: Padding(
         padding: const EdgeInsets.all(16),
         child: Column(
           children: [
             Align(
               alignment: Alignment.centerLeft,
               child: session == null
                   ? ElevatedButton(
                       onPressed: _signIn,
                       child: const Text('Sign in with DevDogs'),
                     )
                   : OutlinedButton(
                       onPressed: _signOut,
                       child: const Text('Sign out'),
                     ),
             ),
             if (session != null) ...[
               const SizedBox(height: 8),
               TextField(
                 controller: _bodyController,
                 decoration: const InputDecoration(labelText: 'Leave a message'),
               ),
               const SizedBox(height: 8),
               ElevatedButton(
                 onPressed: _submit,
                 child: const Text('Sign the guestbook'),
               ),
             ] else
               const Padding(
                 padding: EdgeInsets.symmetric(vertical: 8),
                 child: Text('Sign in to leave a message. Anyone can read below.'),
               ),
             const Divider(height: 32),
             Expanded(
               child: ListView.builder(
                 itemCount: _messages.length,
                 itemBuilder: (context, index) {
                   final message = _messages[index];
+                  final isOwnMessage = session?.user.id == message['user_id'];
                   // Embedded from public.profiles via the messages ->
                   // profiles foreign key. messages.user_id -> profiles.id is
                   // many-to-one, so PostgREST returns a single object here
                   // (or null) -- never a list.
                   final profile = message['profiles'] as Map<String, dynamic>?;
                   final authorName = profile?['name'] as String? ?? 'Unknown';

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
             ),
           ],
         ),
       ),
     );
   }
 }

 /// Formats an ISO timestamp as HH:MM, zero-padded, for display next to a
 /// message.
 String _formatTime(String isoTimestamp) {
   final time = DateTime.parse(isoTimestamp).toLocal();
   final hour = time.hour.toString().padLeft(2, '0');
   final minute = time.minute.toString().padLeft(2, '0');
   return '$hour:$minute';
 }
```

[The whole `lib/guestbook.dart` at this point](https://github.com/DevDogsUGA/Mobile-Workshops/blob/0071976d48b00aa6f2786ac792f0273fae469f7d/lib/guestbook.dart)

<!-- prettier-ignore-end -->
