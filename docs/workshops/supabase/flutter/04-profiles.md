---
name: "Store Names on the Server"
description: "Move display names into a profiles table the server fills in, so the app stops trusting the client."
order: 4
checkpoint: "02-supabase/04-profiles"
---

<!-- Generated from Backstage apps/slides/decks/2026-09-28-supabase.md by `pnpm export:md`; edit the deck, not this file. -->

# Store Names on the Server

<!-- prettier-ignore-start -->

<div class="docs-step-actions">

[Review in VS Code](vscode://devdogsuga.workshops/review?repo=DevDogsUGA%2FMobile-Workshops&to=02-supabase%2F04-profiles&from=02-supabase%2F03-insert-naive)

<details>
<summary>Behind? Catch up to where the last step ended</summary>

**Catch up, keeping your work.** This saves your changes, then brings in the code from the end of the last step. `git commit` needs your name and email set once: see [Git and a GitHub account](/docs/workshops/getting-started/prerequisites#git-and-a-github-account).

```bash cwd=~/Mobile-Workshops
git fetch origin --tags
# Save your own changes first (fine if there's nothing to save)
git add -A
git commit -m "My work"
# Bring in the code from the end of the last step
git merge --no-edit 02-supabase/03-insert-naive
```

Where you and the step changed the same lines, the merge stops with a conflict. Open each file git lists, keep the code you want between the `<<<<<<<` and `>>>>>>>` markers, delete the markers, then finish with `git add -A` and `git commit --no-edit`. To back out instead, run `git merge --abort`.

**Or start over from the last step.** This moves your branch to the end of the last step. Your changes to the step's files are lost; new files you made stay. If you're in the middle of a merge, run `git merge --abort` first.

```bash cwd=~/Mobile-Workshops
git fetch origin --tags
# Moves your branch to the end of the last step
git switch --discard-changes -C <github-username>/02-supabase 02-supabase/03-insert-naive
```

</details>

</div>

Store each person's name once, on the server, when they sign up. Every message then shows the name from their account, and the app stops sending a name at all.

## Move Names into Profiles

**Dashboard → SQL Editor**:

A `profiles` table: one row per person, keyed by their `auth.users` id.

```sql file=supabase/migrations/20260928000100_profiles.sql lines=6-11 href=https://github.com/DevDogsUGA/Web-Workshops/blob/6fc4e76029e55c0299adc31cb9b570101023b3d1/supabase/migrations/20260928000100_profiles.sql#L6-L11 vscode=vscode://devdogsuga.workshops/open?repo=DevDogsUGA%2FWeb-Workshops&ref=02-supabase%2F04-profiles&file=supabase%2Fmigrations%2F20260928000100_profiles.sql&lines=6-11
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null
);

alter table public.profiles enable row level security;
```

Names are public, so everyone can read profiles. There's no write policy: only the trigger below writes here.

```sql file=supabase/migrations/20260928000100_profiles.sql lines=13-19 href=https://github.com/DevDogsUGA/Web-Workshops/blob/6fc4e76029e55c0299adc31cb9b570101023b3d1/supabase/migrations/20260928000100_profiles.sql#L13-L19 vscode=vscode://devdogsuga.workshops/open?repo=DevDogsUGA%2FWeb-Workshops&ref=02-supabase%2F04-profiles&file=supabase%2Fmigrations%2F20260928000100_profiles.sql&lines=13-19
-- Names are public (they show up next to every message), but nobody can
-- write to this table directly -- only the trigger below does that.
create policy "profiles are readable by everyone"
  on public.profiles
  for select
  to anon, authenticated
  using (true);
```

A function that runs as its owner (`security definer`), so it can write a profile the signed-in user can't.

```sql file=supabase/migrations/20260928000100_profiles.sql lines=25-30 href=https://github.com/DevDogsUGA/Web-Workshops/blob/6fc4e76029e55c0299adc31cb9b570101023b3d1/supabase/migrations/20260928000100_profiles.sql#L25-L30 vscode=vscode://devdogsuga.workshops/open?repo=DevDogsUGA%2FWeb-Workshops&ref=02-supabase%2F04-profiles&file=supabase%2Fmigrations%2F20260928000100_profiles.sql&lines=25-30
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
```

It inserts one profile for each new user…

```sql file=supabase/migrations/20260928000100_profiles.sql lines=31-37 href=https://github.com/DevDogsUGA/Web-Workshops/blob/6fc4e76029e55c0299adc31cb9b570101023b3d1/supabase/migrations/20260928000100_profiles.sql#L31-L37 vscode=vscode://devdogsuga.workshops/open?repo=DevDogsUGA%2FWeb-Workshops&ref=02-supabase%2F04-profiles&file=supabase%2Fmigrations%2F20260928000100_profiles.sql&lines=31-37
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'name',
      new.raw_user_meta_data ->> 'full_name',
```

…named by `coalesce`: the first of `name`, `full_name`, `preferred_username`, or the start of the email.

```sql file=supabase/migrations/20260928000100_profiles.sql lines=38-44 href=https://github.com/DevDogsUGA/Web-Workshops/blob/6fc4e76029e55c0299adc31cb9b570101023b3d1/supabase/migrations/20260928000100_profiles.sql#L38-L44 vscode=vscode://devdogsuga.workshops/open?repo=DevDogsUGA%2FWeb-Workshops&ref=02-supabase%2F04-profiles&file=supabase%2Fmigrations%2F20260928000100_profiles.sql&lines=38-44
      new.raw_user_meta_data ->> 'preferred_username',
      split_part(new.email, '@', 1)
    )
  );
  return new;
end;
$$;
```

The trigger runs that function every time someone signs up.

```sql file=supabase/migrations/20260928000100_profiles.sql lines=46-48 href=https://github.com/DevDogsUGA/Web-Workshops/blob/6fc4e76029e55c0299adc31cb9b570101023b3d1/supabase/migrations/20260928000100_profiles.sql#L46-L48 vscode=vscode://devdogsuga.workshops/open?repo=DevDogsUGA%2FWeb-Workshops&ref=02-supabase%2F04-profiles&file=supabase%2Fmigrations%2F20260928000100_profiles.sql&lines=46-48
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

The backfill gives everyone who signed up before tonight a profile too.

```sql file=supabase/migrations/20260928000100_profiles.sql lines=50-61 href=https://github.com/DevDogsUGA/Web-Workshops/blob/6fc4e76029e55c0299adc31cb9b570101023b3d1/supabase/migrations/20260928000100_profiles.sql#L50-L61 vscode=vscode://devdogsuga.workshops/open?repo=DevDogsUGA%2FWeb-Workshops&ref=02-supabase%2F04-profiles&file=supabase%2Fmigrations%2F20260928000100_profiles.sql&lines=50-61
-- Backfill: give everyone who signed up before this migration a profile too.
insert into public.profiles (id, name)
select
  id,
  coalesce(
    raw_user_meta_data ->> 'name',
    raw_user_meta_data ->> 'full_name',
    raw_user_meta_data ->> 'preferred_username',
    split_part(email, '@', 1)
  )
from auth.users
on conflict (id) do nothing;
```

Messages now point at profiles, and the `author_name` column goes away.

```sql file=supabase/migrations/20260928000100_profiles.sql lines=63-70 href=https://github.com/DevDogsUGA/Web-Workshops/blob/6fc4e76029e55c0299adc31cb9b570101023b3d1/supabase/migrations/20260928000100_profiles.sql#L63-L70 vscode=vscode://devdogsuga.workshops/open?repo=DevDogsUGA%2FWeb-Workshops&ref=02-supabase%2F04-profiles&file=supabase%2Fmigrations%2F20260928000100_profiles.sql&lines=63-70
-- Messages now point at profiles (not auth.users directly), so PostgREST
-- can embed `profiles(name)` in a single select. The client can no longer
-- send its own author_name -- the name always comes from the server.
alter table public.messages
  add constraint messages_user_id_profiles_fkey
  foreign key (user_id) references public.profiles (id) on delete cascade;

alter table public.messages drop column author_name;
```

[The whole `supabase/migrations/20260928000100_profiles.sql` at this point](https://github.com/DevDogsUGA/Web-Workshops/blob/6fc4e76029e55c0299adc31cb9b570101023b3d1/supabase/migrations/20260928000100_profiles.sql)

## One Name per Account

No more name field: its controller, its `dispose` call, and the `TextField` go.

```diff file=lib/guestbook.dart lang=dart context=6 href=https://github.com/DevDogsUGA/Mobile-Workshops/compare/4ee8113af098be0a3737bdc0e4cf703a9a8678d7...c7d9b57d87f8138568a002061fbbeac7316fa112#diff-421311fd7986258c9b94592881ea0ebcdeb72cd931b1e96689ee04ac1c77d2ee vscode=vscode://devdogsuga.workshops/review?repo=DevDogsUGA%2FMobile-Workshops&to=02-supabase%2F04-profiles&from=02-supabase%2F03-insert-naive&file=lib%2Fguestbook.dart
--- a/lib/guestbook.dart
+++ b/lib/guestbook.dart
@@ -1,164 +1,155 @@
 import 'package:flutter/foundation.dart' show kIsWeb;
 import 'package:flutter/material.dart';
 import 'package:supabase_flutter/supabase_flutter.dart';

 final _supabase = Supabase.instance.client;

 /// Where the OAuth provider should send the browser (web) or the app
 /// (mobile) back to once sign-in finishes. The scheme below is already
 /// registered in the Android/iOS deep-link setup from `01-flutter-intro`.
 String get _redirectTo =>
     kIsWeb ? Uri.base.origin : 'org.devdogsuga.mobileworkshops://login-callback';

 /// The guestbook, now backed by Supabase instead of an in-memory list.
 class Guestbook extends StatefulWidget {
   const Guestbook({super.key});

   @override
   State<Guestbook> createState() => _GuestbookState();
 }

 class _GuestbookState extends State<Guestbook> {
-  final _nameController = TextEditingController();
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
-    _nameController.dispose();
     _bodyController.dispose();
     super.dispose();
   }

   // Load the guestbook, newest first.
   Future<void> _loadMessages() async {
     try {
       final rows = await _supabase
           .from('messages')
           .select('id, user_id, author_name, body, created_at')
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
-    final name = _nameController.text.trim();
     final body = _bodyController.text.trim();
     final session = _session;

     // Reject the entry if either field is empty once whitespace is trimmed.
     if (session == null || name.isEmpty || body.isEmpty) {
       return;
     }

     // The name is whatever the signed-in user typed into the field below.
     // (The next commit looks this up server-side instead.)
     await _supabase.from('messages').insert({'author_name': name, 'body': body});

-    _nameController.clear();
     _bodyController.clear();
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
-              const SizedBox(height: 8),
-              TextField(
-                controller: _nameController,
-                decoration: const InputDecoration(labelText: 'Name'),
-              ),
               const SizedBox(height: 8),
               TextField(
                 controller: _bodyController,
-                decoration: const InputDecoration(labelText: 'Message'),
+                decoration: const InputDecoration(labelText: 'Leave a message'),
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
                   return ListTile(
                     title: Text(message['author_name'] as String),
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

Only the message is required now.

```diff file=lib/guestbook.dart lang=dart context=6 href=https://github.com/DevDogsUGA/Mobile-Workshops/compare/4ee8113af098be0a3737bdc0e4cf703a9a8678d7...c7d9b57d87f8138568a002061fbbeac7316fa112#diff-421311fd7986258c9b94592881ea0ebcdeb72cd931b1e96689ee04ac1c77d2ee vscode=vscode://devdogsuga.workshops/review?repo=DevDogsUGA%2FMobile-Workshops&to=02-supabase%2F04-profiles&from=02-supabase%2F03-insert-naive&file=lib%2Fguestbook.dart
--- a/lib/guestbook.dart
+++ b/lib/guestbook.dart
@@ -1,155 +1,153 @@
 import 'package:flutter/foundation.dart' show kIsWeb;
 import 'package:flutter/material.dart';
 import 'package:supabase_flutter/supabase_flutter.dart';

 final _supabase = Supabase.instance.client;

 /// Where the OAuth provider should send the browser (web) or the app
 /// (mobile) back to once sign-in finishes. The scheme below is already
 /// registered in the Android/iOS deep-link setup from `01-flutter-intro`.
 String get _redirectTo =>
     kIsWeb ? Uri.base.origin : 'org.devdogsuga.mobileworkshops://login-callback';

 /// The guestbook, now backed by Supabase instead of an in-memory list.
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
           .select('id, user_id, author_name, body, created_at')
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
-
-    // Reject the entry if either field is empty once whitespace is trimmed.
-    if (session == null || name.isEmpty || body.isEmpty) {
+    if (session == null || body.isEmpty) {
       return;
     }

     // The name is whatever the signed-in user typed into the field below.
     // (The next commit looks this up server-side instead.)
     await _supabase.from('messages').insert({'author_name': name, 'body': body});

     _bodyController.clear();
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
                   return ListTile(
                     title: Text(message['author_name'] as String),
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

The insert sends just the message; the server knows who's signed in.

```diff file=lib/guestbook.dart lang=dart context=6 href=https://github.com/DevDogsUGA/Mobile-Workshops/compare/4ee8113af098be0a3737bdc0e4cf703a9a8678d7...c7d9b57d87f8138568a002061fbbeac7316fa112#diff-421311fd7986258c9b94592881ea0ebcdeb72cd931b1e96689ee04ac1c77d2ee vscode=vscode://devdogsuga.workshops/review?repo=DevDogsUGA%2FMobile-Workshops&to=02-supabase%2F04-profiles&from=02-supabase%2F03-insert-naive&file=lib%2Fguestbook.dart
--- a/lib/guestbook.dart
+++ b/lib/guestbook.dart
@@ -1,153 +1,154 @@
 import 'package:flutter/foundation.dart' show kIsWeb;
 import 'package:flutter/material.dart';
 import 'package:supabase_flutter/supabase_flutter.dart';

 final _supabase = Supabase.instance.client;

 /// Where the OAuth provider should send the browser (web) or the app
 /// (mobile) back to once sign-in finishes. The scheme below is already
 /// registered in the Android/iOS deep-link setup from `01-flutter-intro`.
 String get _redirectTo =>
     kIsWeb ? Uri.base.origin : 'org.devdogsuga.mobileworkshops://login-callback';

 /// The guestbook, now backed by Supabase instead of an in-memory list.
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
           .select('id, user_id, author_name, body, created_at')
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

-    // The name is whatever the signed-in user typed into the field below.
-    // (The next commit looks this up server-side instead.)
-    await _supabase.from('messages').insert({'author_name': name, 'body': body});
+    // The name is looked up server-side from public.profiles (set once, at
+    // sign-up) -- we never send it from the client, so no one can post
+    // under a name that isn't theirs.
+    await _supabase.from('messages').insert({'body': body});

     _bodyController.clear();
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
                   return ListTile(
                     title: Text(message['author_name'] as String),
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

## Showing the Author's Name

Names live in `profiles` now, so the app fetches them along with each message.

`profiles(name)` embeds the author's profile through the foreign key, in the same query.

```diff file=lib/guestbook.dart lang=dart context=6 href=https://github.com/DevDogsUGA/Mobile-Workshops/compare/4ee8113af098be0a3737bdc0e4cf703a9a8678d7...c7d9b57d87f8138568a002061fbbeac7316fa112#diff-421311fd7986258c9b94592881ea0ebcdeb72cd931b1e96689ee04ac1c77d2ee vscode=vscode://devdogsuga.workshops/review?repo=DevDogsUGA%2FMobile-Workshops&to=02-supabase%2F04-profiles&from=02-supabase%2F03-insert-naive&file=lib%2Fguestbook.dart
--- a/lib/guestbook.dart
+++ b/lib/guestbook.dart
@@ -1,154 +1,154 @@
 import 'package:flutter/foundation.dart' show kIsWeb;
 import 'package:flutter/material.dart';
 import 'package:supabase_flutter/supabase_flutter.dart';

 final _supabase = Supabase.instance.client;

 /// Where the OAuth provider should send the browser (web) or the app
 /// (mobile) back to once sign-in finishes. The scheme below is already
 /// registered in the Android/iOS deep-link setup from `01-flutter-intro`.
 String get _redirectTo =>
     kIsWeb ? Uri.base.origin : 'org.devdogsuga.mobileworkshops://login-callback';

 /// The guestbook, now backed by Supabase instead of an in-memory list.
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
-          .select('id, user_id, author_name, body, created_at')
+          .select('id, user_id, body, created_at, profiles(name)')
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
                   return ListTile(
                     title: Text(message['author_name'] as String),
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

The profile arrives as a `Map` (or `null`); `?.` and `??` fall back to "Unknown".

```diff file=lib/guestbook.dart lang=dart context=6 href=https://github.com/DevDogsUGA/Mobile-Workshops/compare/4ee8113af098be0a3737bdc0e4cf703a9a8678d7...c7d9b57d87f8138568a002061fbbeac7316fa112#diff-421311fd7986258c9b94592881ea0ebcdeb72cd931b1e96689ee04ac1c77d2ee vscode=vscode://devdogsuga.workshops/review?repo=DevDogsUGA%2FMobile-Workshops&to=02-supabase%2F04-profiles&from=02-supabase%2F03-insert-naive&file=lib%2Fguestbook.dart
--- a/lib/guestbook.dart
+++ b/lib/guestbook.dart
@@ -1,154 +1,161 @@
 import 'package:flutter/foundation.dart' show kIsWeb;
 import 'package:flutter/material.dart';
 import 'package:supabase_flutter/supabase_flutter.dart';

 final _supabase = Supabase.instance.client;

 /// Where the OAuth provider should send the browser (web) or the app
 /// (mobile) back to once sign-in finishes. The scheme below is already
 /// registered in the Android/iOS deep-link setup from `01-flutter-intro`.
 String get _redirectTo =>
     kIsWeb ? Uri.base.origin : 'org.devdogsuga.mobileworkshops://login-callback';

 /// The guestbook, now backed by Supabase instead of an in-memory list.
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
+                  // Embedded from public.profiles via the messages ->
+                  // profiles foreign key. messages.user_id -> profiles.id is
+                  // many-to-one, so PostgREST returns a single object here
+                  // (or null) -- never a list.
+                  final profile = message['profiles'] as Map<String, dynamic>?;
+                  final authorName = profile?['name'] as String? ?? 'Unknown';
+
                   return ListTile(
                     title: Text(message['author_name'] as String),
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

The tile's title shows that name.

```diff file=lib/guestbook.dart lang=dart context=6 href=https://github.com/DevDogsUGA/Mobile-Workshops/compare/4ee8113af098be0a3737bdc0e4cf703a9a8678d7...c7d9b57d87f8138568a002061fbbeac7316fa112#diff-421311fd7986258c9b94592881ea0ebcdeb72cd931b1e96689ee04ac1c77d2ee vscode=vscode://devdogsuga.workshops/review?repo=DevDogsUGA%2FMobile-Workshops&to=02-supabase%2F04-profiles&from=02-supabase%2F03-insert-naive&file=lib%2Fguestbook.dart
--- a/lib/guestbook.dart
+++ b/lib/guestbook.dart
@@ -1,161 +1,161 @@
 import 'package:flutter/foundation.dart' show kIsWeb;
 import 'package:flutter/material.dart';
 import 'package:supabase_flutter/supabase_flutter.dart';

 final _supabase = Supabase.instance.client;

 /// Where the OAuth provider should send the browser (web) or the app
 /// (mobile) back to once sign-in finishes. The scheme below is already
 /// registered in the Android/iOS deep-link setup from `01-flutter-intro`.
 String get _redirectTo =>
     kIsWeb ? Uri.base.origin : 'org.devdogsuga.mobileworkshops://login-callback';

 /// The guestbook, now backed by Supabase instead of an in-memory list.
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
-                    title: Text(message['author_name'] as String),
+                    title: Text(authorName),
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

[The whole `lib/guestbook.dart` at this point](https://github.com/DevDogsUGA/Mobile-Workshops/blob/c7d9b57d87f8138568a002061fbbeac7316fa112/lib/guestbook.dart)

<!-- prettier-ignore-end -->
