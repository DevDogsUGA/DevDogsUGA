---
name: "Deleting Your Own Messages"
description: "Let people delete only their own messages, enforced by a row-level security policy."
order: 5
checkpoint: "02-supabase/05-delete"
---

<!-- Generated from Backstage apps/slides/decks/2026-09-28-supabase.md by `pnpm export:md`; edit the deck, not this file. -->

# Deleting Your Own Messages

<!-- prettier-ignore-start -->

<div class="docs-step-actions">

[Review in VS Code](vscode://devdogsuga.workshops/review?repo=DevDogsUGA%2FMobile-Workshops&to=02-supabase%2F05-delete&from=02-supabase%2F04-profiles)

<details>
<summary>Behind? Catch up to where the last step ended</summary>

**Catch up, keeping your work.** This saves your changes, then brings in the code from the end of the last step. `git commit` needs your name and email set once: see [Git and a GitHub account](../../../_shared/getting-started/prerequisites.md#git-and-a-github-account).

```bash cwd=~/Mobile-Workshops
git fetch origin --tags
# Save your own changes first (fine if there's nothing to save)
git add -A
git commit -m "My work"
# Bring in the code from the end of the last step
git merge --no-edit 02-supabase/04-profiles
```

Where you and the step changed the same lines, the merge stops with a conflict. Open each file git lists, keep the code you want between the `<<<<<<<` and `>>>>>>>` markers, delete the markers, then finish with `git add -A` and `git commit --no-edit`. To back out instead, run `git merge --abort`.

**Or start over from the last step.** This moves your branch to the end of the last step. Your changes to the step's files are lost; new files you made stay. If you're in the middle of a merge, run `git merge --abort` first.

```bash cwd=~/Mobile-Workshops
git fetch origin --tags
# Moves your branch to the end of the last step
git switch --discard-changes -C <github-username>/02-supabase 02-supabase/04-profiles
```

</details>

</div>

## Let Users Delete Their Own Messages

Everything above is in place already: only the new policy at the end runs.

Run it as one query in **Dashboard → SQL Editor**:

```sql
-- Signed-in users can delete a message only when it's theirs. There's no update
-- policy, on purpose.
create policy "authenticated users can delete their own messages"
  on public.messages
  for delete
  to authenticated
  using (auth.uid() = user_id);
```

[The whole `supabase/migrations/20260928000000_guestbook.sql` at this point](https://github.com/DevDogsUGA/Web-Workshops/blob/8f26e3ad3d31168d85c4e4b402f59da66376522f/supabase/migrations/20260928000000_guestbook.sql)

## Only Your Own Delete Button

Deleting takes a handler and a button, shown only on your own messages.

`_delete` removes the row, then reloads the list.

```diff file=lib/guestbook.dart lang=dart context=6 href=https://github.com/DevDogsUGA/Mobile-Workshops/compare/c7d9b57d87f8138568a002061fbbeac7316fa112...df569b9c73159f3c90ff663a51ec3aa28a6326fa#diff-421311fd7986258c9b94592881ea0ebcdeb72cd931b1e96689ee04ac1c77d2ee vscode=vscode://devdogsuga.workshops/review?repo=DevDogsUGA%2FMobile-Workshops&to=02-supabase%2F05-delete&from=02-supabase%2F04-profiles&file=lib%2Fguestbook.dart
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

```diff file=lib/guestbook.dart lang=dart context=6 href=https://github.com/DevDogsUGA/Mobile-Workshops/compare/c7d9b57d87f8138568a002061fbbeac7316fa112...df569b9c73159f3c90ff663a51ec3aa28a6326fa#diff-421311fd7986258c9b94592881ea0ebcdeb72cd931b1e96689ee04ac1c77d2ee vscode=vscode://devdogsuga.workshops/review?repo=DevDogsUGA%2FMobile-Workshops&to=02-supabase%2F05-delete&from=02-supabase%2F04-profiles&file=lib%2Fguestbook.dart
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

[The whole `lib/guestbook.dart` at this point](https://github.com/DevDogsUGA/Mobile-Workshops/blob/df569b9c73159f3c90ff663a51ec3aa28a6326fa/lib/guestbook.dart)

> [!IMPORTANT]
> Hiding the button isn't what protects other people's messages: the delete policy is. Postgres refuses to delete someone else's message, whatever the app shows.

<!-- prettier-ignore-end -->
