---
name: "Read the Guestbook"
description: "Create the messages table with row-level security, and load the guestbook from Supabase."
order: 1
---

<!-- Generated from Backstage apps/slides/decks/2026-09-28-supabase.md by `pnpm export:md`; edit the deck, not this file. -->

# Read the Guestbook

<!-- prettier-ignore-start -->

The guestbook is the part we didn't get to at Setup Night. It's already in your starter code, keeping messages in memory. Now we'll give it a real database.

## Create the Messages Table

**Dashboard → SQL Editor** — `supabase/migrations/20260928000000_guestbook.sql`:

`create table` makes the `messages` table. `default auth.uid()` fills in `user_id` with whoever is signed in.

```sql
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  author_name text not null,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
```

Row-level security goes on: from now on, nobody can read or write a row unless a policy says so.

```sql
alter table public.messages enable row level security;
```

The first policy: anyone, signed in (`authenticated`) or not (`anon`), can read every message.

```sql
-- Anyone (signed in or not) can read the guestbook.
create policy "messages are readable by everyone"
  on public.messages
  for select
  to anon, authenticated
  using (true);
```

[The whole `supabase/migrations/20260928000000_guestbook.sql` at this point](https://github.com/DevDogsUGA/Web-Workshops/blob/8b11ef05caa8e406de1e718a922562c37da330ed/supabase/migrations/20260928000000_guestbook.sql)

## Install the Supabase Client

```bash
# Add the Supabase client
flutter pub add supabase_flutter gotrue
```

## Connect to Supabase

`main.dart` starts the app. Supabase has to be ready before the first screen draws.

`lib/main.dart`:

`main` is now `async`, so it can `await` setup before `runApp`. `ensureInitialized` readies Flutter's plugins first.

```diff
-import 'package:flutter_workshop/shell.dart';
 import 'package:flutter/material.dart';
+import 'package:supabase_flutter/supabase_flutter.dart';

+import 'package:flutter_workshop/shell.dart';
+
+Future<void> main() async {
+  // Supabase needs plugins (e.g. for secure storage) registered before it
+  // can initialize.
+  WidgetsFlutterBinding.ensureInitialized();
+
+
 void main() {
   runApp(const MyApp());
 }
```

`String.fromEnvironment` reads the values that `--dart-define-from-file=.env.local` baked in when you ran the app.

```diff
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

```

[The whole `lib/main.dart` at this point](https://github.com/DevDogsUGA/Mobile-Workshops/blob/864da7db51e62744090c1cc3dd29bf25794d7cfb/lib/main.dart)

## From In-Memory to Supabase

Setup Night's guestbook kept entries in a list in memory, so they vanished on restart.

`lib/guestbook.dart`:

`Supabase.instance.client` is the client `main.dart` set up, shared by the whole app.

```diff
 import 'package:flutter/material.dart';
-
-/// One guestbook entry: who left it, what it says, and when.
-class GuestbookEntry {
-  GuestbookEntry({required this.name, required this.message, required this.time});
+import 'package:supabase_flutter/supabase_flutter.dart';

-  final String name;
-  final String message;
-  final DateTime time;
-}
+final _supabase = Supabase.instance.client;

-/// The guestbook we didn't get to during Setup Night: visitors leave their
-/// name and a message. Everything lives in memory, so it resets whenever the
-/// app restarts, and there's no way to delete an entry once it's posted.
+/// The guestbook, now backed by Supabase instead of an in-memory list.
 class Guestbook extends StatefulWidget {
   const Guestbook({super.key});

```

A `StatefulWidget` keeps data that changes in its `State`. `initState` runs once, when it's created: the place to start loading.

```diff
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
```

A `Future` with `async`/`await` waits for the database without freezing the screen. `setState` redraws with the new rows.

```diff
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
```

`try`/`catch` keeps one failed request from crashing the whole screen.

```diff
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
```

The form goes away for now, and each row arrives as a `Map`: `message['body']`.

```diff
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
```

`created_at` arrives as text, so `_formatTime` parses it before formatting.

```diff
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
```

[The whole `lib/guestbook.dart` at this point](https://github.com/DevDogsUGA/Mobile-Workshops/blob/864da7db51e62744090c1cc3dd29bf25794d7cfb/lib/guestbook.dart)

<!-- prettier-ignore-end -->
