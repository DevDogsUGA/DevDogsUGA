---
name: "Read the Guestbook"
description: "Create the messages table with row-level security, and load the guestbook from Supabase."
order: 1
checkpoint: "02-supabase/01-read"
---

<!-- Generated from Backstage apps/slides/decks/2026-09-28-supabase.md by `pnpm export:md`; edit the deck, not this file. -->

# Read the Guestbook

<!-- prettier-ignore-start -->

<div class="docs-step-actions">

[Review in VS Code](vscode://devdogsuga.workshops/review?repo=DevDogsUGA%2FMobile-Workshops&to=02-supabase%2F01-read&from=02-supabase%2F00-start)

<details>
<summary>Behind? Catch up to where the last step ended</summary>

**Catch up, keeping your work.** This saves your changes, then brings in the code from the end of the last step. `git commit` needs your name and email set once: see [Git and a GitHub account](/docs/workshops/getting-started/prerequisites#git-and-a-github-account).

```bash cwd=~/Mobile-Workshops
git fetch origin --tags
# Save your own changes first (fine if there's nothing to save)
git add -A
git commit -m "My work"
# Bring in the code from the end of the last step
git merge --no-edit 02-supabase/00-start
```

Where you and the step changed the same lines, the merge stops with a conflict. Open each file git lists, keep the code you want between the `<<<<<<<` and `>>>>>>>` markers, delete the markers, then finish with `git add -A` and `git commit --no-edit`. To back out instead, run `git merge --abort`.

**Or start over from the last step.** This moves your branch to the end of the last step. Your changes to the step's files are lost; new files you made stay. If you're in the middle of a merge, run `git merge --abort` first.

```bash cwd=~/Mobile-Workshops
git fetch origin --tags
# Moves your branch to the end of the last step
git switch --discard-changes -C <github-username>/02-supabase 02-supabase/00-start
```

</details>

</div>

The guestbook from Framework Intros is already in your starter code, keeping messages in memory. Now we'll give it a real database.

## Create the Messages Table

Run it as one query in **Dashboard → SQL Editor**:

```sql
-- create table makes the messages table. default auth.uid() fills in user_id
-- with whoever is signed in.
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  author_name text not null,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

-- Row-level security goes on: from now on, nobody can read or write a row
-- unless a policy says so.
alter table public.messages enable row level security;

-- The first policy: anyone, signed in (authenticated) or not (anon), can read
-- every message.
create policy "messages are readable by everyone"
  on public.messages
  for select
  to anon, authenticated
  using (true);
```

[The whole `supabase/migrations/20260928000000_guestbook.sql` at this point](https://github.com/DevDogsUGA/Web-Workshops/blob/469df6f2a496d788b9887ffae477a40995ccc0fd/supabase/migrations/20260928000000_guestbook.sql)

## Install the Supabase Client

```bash cwd=~/Mobile-Workshops
# Add the Supabase client
flutter pub add supabase_flutter gotrue
```

<details>
<summary>Why add <code>gotrue</code> too?</summary>

`supabase_flutter` already depends on it, but custom OIDC providers like DevDogs need `gotrue` 2.20 or newer. Adding it directly makes sure you get one.

</details>

## Connect to Supabase

`main.dart` starts the app. Supabase has to be ready before the first screen draws.

`main` is now `async`, so it can `await` setup before `runApp`. `ensureInitialized` readies Flutter's plugins first.

```diff file=lib/main.dart lang=dart context=6 href=https://github.com/DevDogsUGA/Mobile-Workshops/compare/c14c64dc15b4e3b0c030cbccbee20949c3884b23...7fd7904f48cb294ede0ea901345dabc44cdff2af#diff-e61eb31d013d12616f5532636a88cfa63631dda8f7829e5424e68542214d1608 vscode=vscode://devdogsuga.workshops/review?repo=DevDogsUGA%2FMobile-Workshops&to=02-supabase%2F01-read&from=02-supabase%2F00-start&file=lib%2Fmain.dart
--- a/lib/main.dart
+++ b/lib/main.dart
@@ -1,22 +1,30 @@
-import 'package:flutter_workshop/shell.dart';
 import 'package:flutter/material.dart';
+import 'package:supabase_flutter/supabase_flutter.dart';
+
+import 'package:flutter_workshop/shell.dart';
+
+Future<void> main() async {
+  // Supabase needs plugins (e.g. for secure storage) registered before it
+  // can initialize.
+  WidgetsFlutterBinding.ensureInitialized();
+

 void main() {
   runApp(const MyApp());
 }

 class MyApp extends StatelessWidget {
   const MyApp({super.key});

   // This widget is the root of your application.
   @override
   Widget build(BuildContext context) {
     return MaterialApp(
       title: 'DevDogs Workshop',
       theme: ThemeData(
         colorScheme: ColorScheme.fromSeed(seedColor: Colors.deepPurple),
       ),
       home: const Shell(),
     );
   }
 }
```

`String.fromEnvironment` reads the values that `--dart-define-from-file=.env.local` baked in when you ran the app.

```diff file=lib/main.dart lang=dart context=6 href=https://github.com/DevDogsUGA/Mobile-Workshops/compare/c14c64dc15b4e3b0c030cbccbee20949c3884b23...7fd7904f48cb294ede0ea901345dabc44cdff2af#diff-e61eb31d013d12616f5532636a88cfa63631dda8f7829e5424e68542214d1608 vscode=vscode://devdogsuga.workshops/review?repo=DevDogsUGA%2FMobile-Workshops&to=02-supabase%2F01-read&from=02-supabase%2F00-start&file=lib%2Fmain.dart
--- a/lib/main.dart
+++ b/lib/main.dart
@@ -1,30 +1,36 @@
 import 'package:flutter/material.dart';
 import 'package:supabase_flutter/supabase_flutter.dart';

 import 'package:flutter_workshop/shell.dart';

 Future<void> main() async {
   // Supabase needs plugins (e.g. for secure storage) registered before it
   // can initialize.
   WidgetsFlutterBinding.ensureInitialized();

+  // Both values are supplied at build/run time with
+  // `--dart-define-from-file=.env.local` -- see the README. Neither is a
+  // secret: the publishable key is safe to ship in a client app.
+  await Supabase.initialize(
+    url: const String.fromEnvironment('SUPABASE_URL'),
+    publishableKey: const String.fromEnvironment('SUPABASE_PUBLISHABLE_KEY'),
+  );

-void main() {
   runApp(const MyApp());
 }

 class MyApp extends StatelessWidget {
   const MyApp({super.key});

   // This widget is the root of your application.
   @override
   Widget build(BuildContext context) {
     return MaterialApp(
       title: 'DevDogs Workshop',
       theme: ThemeData(
         colorScheme: ColorScheme.fromSeed(seedColor: Colors.deepPurple),
       ),
       home: const Shell(),
     );
   }
 }
```

[The whole `lib/main.dart` at this point](https://github.com/DevDogsUGA/Mobile-Workshops/blob/7fd7904f48cb294ede0ea901345dabc44cdff2af/lib/main.dart)

## From In-Memory to Supabase

The guestbook from Framework Intros kept entries in a list in memory, so they vanished on restart.

`Supabase.instance.client` is the client `main.dart` set up, shared by the whole app.

```diff file=lib/guestbook.dart lang=dart context=6 href=https://github.com/DevDogsUGA/Mobile-Workshops/compare/c14c64dc15b4e3b0c030cbccbee20949c3884b23...7fd7904f48cb294ede0ea901345dabc44cdff2af#diff-421311fd7986258c9b94592881ea0ebcdeb72cd931b1e96689ee04ac1c77d2ee vscode=vscode://devdogsuga.workshops/review?repo=DevDogsUGA%2FMobile-Workshops&to=02-supabase%2F01-read&from=02-supabase%2F00-start&file=lib%2Fguestbook.dart
--- a/lib/guestbook.dart
+++ b/lib/guestbook.dart
@@ -1,101 +1,93 @@
 import 'package:flutter/material.dart';
+import 'package:supabase_flutter/supabase_flutter.dart';

-/// One guestbook entry: who left it, what it says, and when.
-class GuestbookEntry {
-  GuestbookEntry({required this.name, required this.message, required this.time});
+final _supabase = Supabase.instance.client;

-  final String name;
-  final String message;
-  final DateTime time;
-}
-
-/// The guestbook we didn't get to during Setup Night: visitors leave their
-/// name and a message. Everything lives in memory, so it resets whenever the
-/// app restarts, and there's no way to delete an entry once it's posted.
+/// The guestbook, now backed by Supabase instead of an in-memory list.
 class Guestbook extends StatefulWidget {
   const Guestbook({super.key});

   @override
   State<Guestbook> createState() => _GuestbookState();
 }

 class _GuestbookState extends State<Guestbook> {
   final _nameController = TextEditingController();
   final _messageController = TextEditingController();

   // Newest entries are added to the front of the list, so the list itself is
   // always in "newest first" order.
   final List<GuestbookEntry> _entries = [];

   @override
   void dispose() {
     _nameController.dispose();
     _messageController.dispose();
     super.dispose();
   }

   void _submit() {
     final name = _nameController.text.trim();
     final message = _messageController.text.trim();

     // Reject the entry if either field is empty once whitespace is trimmed.
     if (name.isEmpty || message.isEmpty) {
       return;
     }

     setState(() {
       _entries.insert(
         0,
         GuestbookEntry(name: name, message: message, time: DateTime.now()),
       );
       _nameController.clear();
       _messageController.clear();
     });
   }

   @override
   Widget build(BuildContext context) {
     return Scaffold(
       appBar: AppBar(title: const Text('Guestbook')),
       body: Padding(
         padding: const EdgeInsets.all(16),
         child: Column(
           children: [
             TextField(
               controller: _nameController,
               decoration: const InputDecoration(labelText: 'Name'),
             ),
             const SizedBox(height: 8),
             TextField(
               controller: _messageController,
               decoration: const InputDecoration(labelText: 'Message'),
             ),
             const SizedBox(height: 8),
             ElevatedButton(onPressed: _submit, child: const Text('Sign the guestbook')),
             const Divider(height: 32),
             Expanded(
               child: ListView.builder(
                 itemCount: _entries.length,
                 itemBuilder: (context, index) {
                   final entry = _entries[index];
                   return ListTile(
                     title: Text(entry.name),
                     subtitle: Text(entry.message),
                     trailing: Text(_formatTime(entry.time)),
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

 /// Formats a time as HH:MM, zero-padded, for display next to an entry.
 String _formatTime(DateTime time) {
   final hour = time.hour.toString().padLeft(2, '0');
   final minute = time.minute.toString().padLeft(2, '0');
   return '$hour:$minute';
 }
```

A `StatefulWidget` keeps data that changes in its `State`. `initState` runs once, when it's created: the place to start loading.

```diff file=lib/guestbook.dart lang=dart context=6 href=https://github.com/DevDogsUGA/Mobile-Workshops/compare/c14c64dc15b4e3b0c030cbccbee20949c3884b23...7fd7904f48cb294ede0ea901345dabc44cdff2af#diff-421311fd7986258c9b94592881ea0ebcdeb72cd931b1e96689ee04ac1c77d2ee vscode=vscode://devdogsuga.workshops/review?repo=DevDogsUGA%2FMobile-Workshops&to=02-supabase%2F01-read&from=02-supabase%2F00-start&file=lib%2Fguestbook.dart
--- a/lib/guestbook.dart
+++ b/lib/guestbook.dart
@@ -1,93 +1,87 @@
 import 'package:flutter/material.dart';
 import 'package:supabase_flutter/supabase_flutter.dart';

 final _supabase = Supabase.instance.client;

 /// The guestbook, now backed by Supabase instead of an in-memory list.
 class Guestbook extends StatefulWidget {
   const Guestbook({super.key});

   @override
   State<Guestbook> createState() => _GuestbookState();
 }

 class _GuestbookState extends State<Guestbook> {
-  final _nameController = TextEditingController();
-  final _messageController = TextEditingController();
-
-  // Newest entries are added to the front of the list, so the list itself is
-  // always in "newest first" order.
-  final List<GuestbookEntry> _entries = [];
+  List<Map<String, dynamic>> _messages = [];

   @override
-  void dispose() {
-    _nameController.dispose();
-    _messageController.dispose();
-    super.dispose();
+  void initState() {
+    super.initState();
+    _loadMessages();
   }

   void _submit() {
     final name = _nameController.text.trim();
     final message = _messageController.text.trim();

     // Reject the entry if either field is empty once whitespace is trimmed.
     if (name.isEmpty || message.isEmpty) {
       return;
     }

     setState(() {
       _entries.insert(
         0,
         GuestbookEntry(name: name, message: message, time: DateTime.now()),
       );
       _nameController.clear();
       _messageController.clear();
     });
   }

   @override
   Widget build(BuildContext context) {
     return Scaffold(
       appBar: AppBar(title: const Text('Guestbook')),
       body: Padding(
         padding: const EdgeInsets.all(16),
         child: Column(
           children: [
             TextField(
               controller: _nameController,
               decoration: const InputDecoration(labelText: 'Name'),
             ),
             const SizedBox(height: 8),
             TextField(
               controller: _messageController,
               decoration: const InputDecoration(labelText: 'Message'),
             ),
             const SizedBox(height: 8),
             ElevatedButton(onPressed: _submit, child: const Text('Sign the guestbook')),
             const Divider(height: 32),
             Expanded(
               child: ListView.builder(
                 itemCount: _entries.length,
                 itemBuilder: (context, index) {
                   final entry = _entries[index];
                   return ListTile(
                     title: Text(entry.name),
                     subtitle: Text(entry.message),
                     trailing: Text(_formatTime(entry.time)),
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

 /// Formats a time as HH:MM, zero-padded, for display next to an entry.
 String _formatTime(DateTime time) {
   final hour = time.hour.toString().padLeft(2, '0');
   final minute = time.minute.toString().padLeft(2, '0');
   return '$hour:$minute';
 }
```

A `Future` with `async`/`await` waits for the database without freezing the screen. `setState` redraws with the new rows.

```diff file=lib/guestbook.dart lang=dart context=6 href=https://github.com/DevDogsUGA/Mobile-Workshops/compare/c14c64dc15b4e3b0c030cbccbee20949c3884b23...7fd7904f48cb294ede0ea901345dabc44cdff2af#diff-421311fd7986258c9b94592881ea0ebcdeb72cd931b1e96689ee04ac1c77d2ee vscode=vscode://devdogsuga.workshops/review?repo=DevDogsUGA%2FMobile-Workshops&to=02-supabase%2F01-read&from=02-supabase%2F00-start&file=lib%2Fguestbook.dart
--- a/lib/guestbook.dart
+++ b/lib/guestbook.dart
@@ -1,87 +1,90 @@
 import 'package:flutter/material.dart';
 import 'package:supabase_flutter/supabase_flutter.dart';

 final _supabase = Supabase.instance.client;

 /// The guestbook, now backed by Supabase instead of an in-memory list.
 class Guestbook extends StatefulWidget {
   const Guestbook({super.key});

   @override
   State<Guestbook> createState() => _GuestbookState();
 }

 class _GuestbookState extends State<Guestbook> {
   List<Map<String, dynamic>> _messages = [];

   @override
   void initState() {
     super.initState();
     _loadMessages();
   }

-  void _submit() {
-    final name = _nameController.text.trim();
-    final message = _messageController.text.trim();
-
-    // Reject the entry if either field is empty once whitespace is trimmed.
-    if (name.isEmpty || message.isEmpty) {
-      return;
+  // Load the guestbook, newest first.
+  Future<void> _loadMessages() async {
+    try {
+      final rows = await _supabase
+          .from('messages')
+          .select('id, user_id, author_name, body, created_at')
+          .order('created_at', ascending: false);
+      if (mounted) {
+        setState(() => _messages = List<Map<String, dynamic>>.from(rows));
+      }
     }

     setState(() {
       _entries.insert(
         0,
         GuestbookEntry(name: name, message: message, time: DateTime.now()),
       );
       _nameController.clear();
       _messageController.clear();
     });
   }

   @override
   Widget build(BuildContext context) {
     return Scaffold(
       appBar: AppBar(title: const Text('Guestbook')),
       body: Padding(
         padding: const EdgeInsets.all(16),
         child: Column(
           children: [
             TextField(
               controller: _nameController,
               decoration: const InputDecoration(labelText: 'Name'),
             ),
             const SizedBox(height: 8),
             TextField(
               controller: _messageController,
               decoration: const InputDecoration(labelText: 'Message'),
             ),
             const SizedBox(height: 8),
             ElevatedButton(onPressed: _submit, child: const Text('Sign the guestbook')),
             const Divider(height: 32),
             Expanded(
               child: ListView.builder(
                 itemCount: _entries.length,
                 itemBuilder: (context, index) {
                   final entry = _entries[index];
                   return ListTile(
                     title: Text(entry.name),
                     subtitle: Text(entry.message),
                     trailing: Text(_formatTime(entry.time)),
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

 /// Formats a time as HH:MM, zero-padded, for display next to an entry.
 String _formatTime(DateTime time) {
   final hour = time.hour.toString().padLeft(2, '0');
   final minute = time.minute.toString().padLeft(2, '0');
   return '$hour:$minute';
 }
```

`try`/`catch` keeps one failed request from crashing the whole screen.

```diff file=lib/guestbook.dart lang=dart context=6 href=https://github.com/DevDogsUGA/Mobile-Workshops/compare/c14c64dc15b4e3b0c030cbccbee20949c3884b23...7fd7904f48cb294ede0ea901345dabc44cdff2af#diff-421311fd7986258c9b94592881ea0ebcdeb72cd931b1e96689ee04ac1c77d2ee vscode=vscode://devdogsuga.workshops/review?repo=DevDogsUGA%2FMobile-Workshops&to=02-supabase%2F01-read&from=02-supabase%2F00-start&file=lib%2Fguestbook.dart
--- a/lib/guestbook.dart
+++ b/lib/guestbook.dart
@@ -1,90 +1,85 @@
 import 'package:flutter/material.dart';
 import 'package:supabase_flutter/supabase_flutter.dart';

 final _supabase = Supabase.instance.client;

 /// The guestbook, now backed by Supabase instead of an in-memory list.
 class Guestbook extends StatefulWidget {
   const Guestbook({super.key});

   @override
   State<Guestbook> createState() => _GuestbookState();
 }

 class _GuestbookState extends State<Guestbook> {
   List<Map<String, dynamic>> _messages = [];

   @override
   void initState() {
     super.initState();
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
+    } catch (error) {
+      // The workshop's dev server might not be running yet -- don't crash
+      // the whole screen over it.
+      debugPrint('Could not load the guestbook: $error');
     }
-
-    setState(() {
-      _entries.insert(
-        0,
-        GuestbookEntry(name: name, message: message, time: DateTime.now()),
-      );
-      _nameController.clear();
-      _messageController.clear();
-    });
   }

   @override
   Widget build(BuildContext context) {
     return Scaffold(
       appBar: AppBar(title: const Text('Guestbook')),
       body: Padding(
         padding: const EdgeInsets.all(16),
         child: Column(
           children: [
             TextField(
               controller: _nameController,
               decoration: const InputDecoration(labelText: 'Name'),
             ),
             const SizedBox(height: 8),
             TextField(
               controller: _messageController,
               decoration: const InputDecoration(labelText: 'Message'),
             ),
             const SizedBox(height: 8),
             ElevatedButton(onPressed: _submit, child: const Text('Sign the guestbook')),
             const Divider(height: 32),
             Expanded(
               child: ListView.builder(
                 itemCount: _entries.length,
                 itemBuilder: (context, index) {
                   final entry = _entries[index];
                   return ListTile(
                     title: Text(entry.name),
                     subtitle: Text(entry.message),
                     trailing: Text(_formatTime(entry.time)),
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

 /// Formats a time as HH:MM, zero-padded, for display next to an entry.
 String _formatTime(DateTime time) {
   final hour = time.hour.toString().padLeft(2, '0');
   final minute = time.minute.toString().padLeft(2, '0');
   return '$hour:$minute';
 }
```

The form goes away for now, and each row arrives as a `Map`: `message['body']`.

```diff file=lib/guestbook.dart lang=dart context=6 href=https://github.com/DevDogsUGA/Mobile-Workshops/compare/c14c64dc15b4e3b0c030cbccbee20949c3884b23...7fd7904f48cb294ede0ea901345dabc44cdff2af#diff-421311fd7986258c9b94592881ea0ebcdeb72cd931b1e96689ee04ac1c77d2ee vscode=vscode://devdogsuga.workshops/review?repo=DevDogsUGA%2FMobile-Workshops&to=02-supabase%2F01-read&from=02-supabase%2F00-start&file=lib%2Fguestbook.dart
--- a/lib/guestbook.dart
+++ b/lib/guestbook.dart
@@ -1,85 +1,75 @@
 import 'package:flutter/material.dart';
 import 'package:supabase_flutter/supabase_flutter.dart';

 final _supabase = Supabase.instance.client;

 /// The guestbook, now backed by Supabase instead of an in-memory list.
 class Guestbook extends StatefulWidget {
   const Guestbook({super.key});

   @override
   State<Guestbook> createState() => _GuestbookState();
 }

 class _GuestbookState extends State<Guestbook> {
   List<Map<String, dynamic>> _messages = [];

   @override
   void initState() {
     super.initState();
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

   @override
   Widget build(BuildContext context) {
     return Scaffold(
       appBar: AppBar(title: const Text('Guestbook')),
       body: Padding(
         padding: const EdgeInsets.all(16),
         child: Column(
           children: [
-            TextField(
-              controller: _nameController,
-              decoration: const InputDecoration(labelText: 'Name'),
-            ),
-            const SizedBox(height: 8),
-            TextField(
-              controller: _messageController,
-              decoration: const InputDecoration(labelText: 'Message'),
-            ),
-            const SizedBox(height: 8),
-            ElevatedButton(onPressed: _submit, child: const Text('Sign the guestbook')),
+            const Text('Anyone can read the guestbook below. Sign-in is coming next.'),
             const Divider(height: 32),
             Expanded(
               child: ListView.builder(
-                itemCount: _entries.length,
+                itemCount: _messages.length,
                 itemBuilder: (context, index) {
-                  final entry = _entries[index];
+                  final message = _messages[index];
                   return ListTile(
-                    title: Text(entry.name),
-                    subtitle: Text(entry.message),
-                    trailing: Text(_formatTime(entry.time)),
+                    title: Text(message['author_name'] as String),
+                    subtitle: Text(message['body'] as String),
+                    trailing: Text(_formatTime(message['created_at'] as String)),
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

 /// Formats a time as HH:MM, zero-padded, for display next to an entry.
 String _formatTime(DateTime time) {
   final hour = time.hour.toString().padLeft(2, '0');
   final minute = time.minute.toString().padLeft(2, '0');
   return '$hour:$minute';
 }
```

`created_at` arrives as text, so `_formatTime` parses it before formatting.

```diff file=lib/guestbook.dart lang=dart context=6 href=https://github.com/DevDogsUGA/Mobile-Workshops/compare/c14c64dc15b4e3b0c030cbccbee20949c3884b23...7fd7904f48cb294ede0ea901345dabc44cdff2af#diff-421311fd7986258c9b94592881ea0ebcdeb72cd931b1e96689ee04ac1c77d2ee vscode=vscode://devdogsuga.workshops/review?repo=DevDogsUGA%2FMobile-Workshops&to=02-supabase%2F01-read&from=02-supabase%2F00-start&file=lib%2Fguestbook.dart
--- a/lib/guestbook.dart
+++ b/lib/guestbook.dart
@@ -1,75 +1,77 @@
 import 'package:flutter/material.dart';
 import 'package:supabase_flutter/supabase_flutter.dart';

 final _supabase = Supabase.instance.client;

 /// The guestbook, now backed by Supabase instead of an in-memory list.
 class Guestbook extends StatefulWidget {
   const Guestbook({super.key});

   @override
   State<Guestbook> createState() => _GuestbookState();
 }

 class _GuestbookState extends State<Guestbook> {
   List<Map<String, dynamic>> _messages = [];

   @override
   void initState() {
     super.initState();
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

   @override
   Widget build(BuildContext context) {
     return Scaffold(
       appBar: AppBar(title: const Text('Guestbook')),
       body: Padding(
         padding: const EdgeInsets.all(16),
         child: Column(
           children: [
             const Text('Anyone can read the guestbook below. Sign-in is coming next.'),
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

-/// Formats a time as HH:MM, zero-padded, for display next to an entry.
-String _formatTime(DateTime time) {
+/// Formats an ISO timestamp as HH:MM, zero-padded, for display next to a
+/// message.
+String _formatTime(String isoTimestamp) {
+  final time = DateTime.parse(isoTimestamp).toLocal();
   final hour = time.hour.toString().padLeft(2, '0');
   final minute = time.minute.toString().padLeft(2, '0');
   return '$hour:$minute';
 }
```

[The whole `lib/guestbook.dart` at this point](https://github.com/DevDogsUGA/Mobile-Workshops/blob/7fd7904f48cb294ede0ea901345dabc44cdff2af/lib/guestbook.dart)

<!-- prettier-ignore-end -->
