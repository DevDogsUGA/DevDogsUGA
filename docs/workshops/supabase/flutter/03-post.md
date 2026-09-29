---
name: "Let Signed-In Users Post"
description: "Let signed-in users post, with a policy that only lets them post as themselves."
order: 3
---

<!-- Generated from Backstage apps/slides/decks/2026-09-28-supabase.md by `pnpm export:md`; edit the deck, not this file. -->

# Let Signed-In Users Post

<!-- prettier-ignore-start -->

<details>
<summary>Behind? Start from where the last step ended</summary>

These put your copy of the workshop code exactly where the previous step left it.

```bash cwd=~/Mobile-Workshops
# Get the checkpoint tags
git fetch origin --tags
# Throws away your changes to the workshop code
git switch --detach --discard-changes demo/02-sign-in
```

</details>

## Allow Signed-In Posts

**Dashboard → SQL Editor**:

The table and read policy from step 1. The new policy goes at the end.

Only signed-in users can insert, and `with check (auth.uid() = user_id)` means only as themselves.

```diff file=supabase/migrations/20260928000000_guestbook.sql lang=sql context=6 href=https://github.com/DevDogsUGA/Web-Workshops/compare/edc945f9755121c1d6d0ecf54be2ace9c1fc9237...1b91fdba8d5d9f3494b4d1a1ad8c2b702633abfe#diff-5d1eb0c93f905e8db60c6bf0111f6a064ec9a44666f86a14842c382c1b354ae1
--- a/supabase/migrations/20260928000000_guestbook.sql
+++ b/supabase/migrations/20260928000000_guestbook.sql
@@ -1,22 +1,29 @@
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
+
+-- Only signed-in users can post, and only under their own user id.
+create policy "authenticated users can insert their own messages"
+  on public.messages
+  for insert
+  to authenticated
+  with check (auth.uid() = user_id);
```

[The whole `supabase/migrations/20260928000000_guestbook.sql` at this point](https://github.com/DevDogsUGA/Web-Workshops/blob/1b91fdba8d5d9f3494b4d1a1ad8c2b702633abfe/supabase/migrations/20260928000000_guestbook.sql)

## Posting a Message

The form from Setup Night comes back, now saving to the database.

A `TextEditingController` holds what's typed in a text field.

```diff file=lib/guestbook.dart lang=dart context=6 href=https://github.com/DevDogsUGA/Mobile-Workshops/compare/41d9344b3662f0648003d163e1e439a4f7042bbc...191e71aeec4819dfa82c46d12d2e2bcd5e68a4cd#diff-421311fd7986258c9b94592881ea0ebcdeb72cd931b1e96689ee04ac1c77d2ee
--- a/lib/guestbook.dart
+++ b/lib/guestbook.dart
@@ -1,116 +1,119 @@
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
+  final _nameController = TextEditingController();
+  final _bodyController = TextEditingController();
+
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
             const SizedBox(height: 8),
             const Text('Anyone can read the guestbook below. Posting is coming next.'),
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

`dispose` frees the controllers when the widget goes away.

```diff file=lib/guestbook.dart lang=dart context=6 href=https://github.com/DevDogsUGA/Mobile-Workshops/compare/41d9344b3662f0648003d163e1e439a4f7042bbc...191e71aeec4819dfa82c46d12d2e2bcd5e68a4cd#diff-421311fd7986258c9b94592881ea0ebcdeb72cd931b1e96689ee04ac1c77d2ee
--- a/lib/guestbook.dart
+++ b/lib/guestbook.dart
@@ -1,119 +1,126 @@
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
   final _nameController = TextEditingController();
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

+  @override
+  void dispose() {
+    _nameController.dispose();
+    _bodyController.dispose();
+    super.dispose();
+  }
+
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
             const SizedBox(height: 8),
             const Text('Anyone can read the guestbook below. Posting is coming next.'),
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

`_submit` is `async`. It reads both fields and stops if either is empty.

```diff file=lib/guestbook.dart lang=dart context=6 href=https://github.com/DevDogsUGA/Mobile-Workshops/compare/41d9344b3662f0648003d163e1e439a4f7042bbc...191e71aeec4819dfa82c46d12d2e2bcd5e68a4cd#diff-421311fd7986258c9b94592881ea0ebcdeb72cd931b1e96689ee04ac1c77d2ee
--- a/lib/guestbook.dart
+++ b/lib/guestbook.dart
@@ -1,126 +1,136 @@
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
   final _nameController = TextEditingController();
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
     _nameController.dispose();
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

+  Future<void> _submit() async {
+    final name = _nameController.text.trim();
+    final body = _bodyController.text.trim();
+    final session = _session;
+
+    // Reject the entry if either field is empty once whitespace is trimmed.
+    if (session == null || name.isEmpty || body.isEmpty) {
+      return;
+    }
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
             const SizedBox(height: 8),
             const Text('Anyone can read the guestbook below. Posting is coming next.'),
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

`await` the insert, then clear the fields and reload the list.

```diff file=lib/guestbook.dart lang=dart context=6 href=https://github.com/DevDogsUGA/Mobile-Workshops/compare/41d9344b3662f0648003d163e1e439a4f7042bbc...191e71aeec4819dfa82c46d12d2e2bcd5e68a4cd#diff-421311fd7986258c9b94592881ea0ebcdeb72cd931b1e96689ee04ac1c77d2ee
--- a/lib/guestbook.dart
+++ b/lib/guestbook.dart
@@ -1,136 +1,145 @@
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
   final _nameController = TextEditingController();
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
     _nameController.dispose();
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
     final name = _nameController.text.trim();
     final body = _bodyController.text.trim();
     final session = _session;

     // Reject the entry if either field is empty once whitespace is trimmed.
     if (session == null || name.isEmpty || body.isEmpty) {
       return;
     }

+    // The name is whatever the signed-in user typed into the field below.
+    // (The next commit looks this up server-side instead.)
+    await _supabase.from('messages').insert({'author_name': name, 'body': body});
+
+    _nameController.clear();
+    _bodyController.clear();
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
             const SizedBox(height: 8),
             const Text('Anyone can read the guestbook below. Posting is coming next.'),
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

`if (session != null) ...[ ]` adds the fields to the column only for signed-in users.

```diff file=lib/guestbook.dart lang=dart context=6 href=https://github.com/DevDogsUGA/Mobile-Workshops/compare/41d9344b3662f0648003d163e1e439a4f7042bbc...191e71aeec4819dfa82c46d12d2e2bcd5e68a4cd#diff-421311fd7986258c9b94592881ea0ebcdeb72cd931b1e96689ee04ac1c77d2ee
--- a/lib/guestbook.dart
+++ b/lib/guestbook.dart
@@ -1,145 +1,153 @@
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
   final _nameController = TextEditingController();
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
     _nameController.dispose();
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
     final name = _nameController.text.trim();
     final body = _bodyController.text.trim();
     final session = _session;

     // Reject the entry if either field is empty once whitespace is trimmed.
     if (session == null || name.isEmpty || body.isEmpty) {
       return;
     }

     // The name is whatever the signed-in user typed into the field below.
     // (The next commit looks this up server-side instead.)
     await _supabase.from('messages').insert({'author_name': name, 'body': body});

     _nameController.clear();
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
-            const SizedBox(height: 8),
-            const Text('Anyone can read the guestbook below. Posting is coming next.'),
+            if (session != null) ...[
+              const SizedBox(height: 8),
+              TextField(
+                controller: _nameController,
+                decoration: const InputDecoration(labelText: 'Name'),
+              ),
+              const SizedBox(height: 8),
+              TextField(
+                controller: _bodyController,
+                decoration: const InputDecoration(labelText: 'Message'),
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

Signed-out visitors get a hint instead of the form.

```diff file=lib/guestbook.dart lang=dart context=6 href=https://github.com/DevDogsUGA/Mobile-Workshops/compare/41d9344b3662f0648003d163e1e439a4f7042bbc...191e71aeec4819dfa82c46d12d2e2bcd5e68a4cd#diff-421311fd7986258c9b94592881ea0ebcdeb72cd931b1e96689ee04ac1c77d2ee
--- a/lib/guestbook.dart
+++ b/lib/guestbook.dart
@@ -1,153 +1,164 @@
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
   final _nameController = TextEditingController();
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
     _nameController.dispose();
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
     final name = _nameController.text.trim();
     final body = _bodyController.text.trim();
     final session = _session;

     // Reject the entry if either field is empty once whitespace is trimmed.
     if (session == null || name.isEmpty || body.isEmpty) {
       return;
     }

     // The name is whatever the signed-in user typed into the field below.
     // (The next commit looks this up server-side instead.)
     await _supabase.from('messages').insert({'author_name': name, 'body': body});

     _nameController.clear();
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
                 controller: _nameController,
                 decoration: const InputDecoration(labelText: 'Name'),
               ),
               const SizedBox(height: 8),
               TextField(
                 controller: _bodyController,
                 decoration: const InputDecoration(labelText: 'Message'),
+              ),
+              const SizedBox(height: 8),
+              ElevatedButton(
+                onPressed: _submit,
+                child: const Text('Sign the guestbook'),
+              ),
+            ] else
+              const Padding(
+                padding: EdgeInsets.symmetric(vertical: 8),
+                child: Text('Sign in to leave a message. Anyone can read below.'),
+              ),
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

[The whole `lib/guestbook.dart` at this point](https://github.com/DevDogsUGA/Mobile-Workshops/blob/191e71aeec4819dfa82c46d12d2e2bcd5e68a4cd/lib/guestbook.dart)

## What's Wrong with This?

The **app** decides whose name goes on each message: type any name you like, and the database stores it. Nothing ties the name to the person who's signed in.

<!-- prettier-ignore-end -->
