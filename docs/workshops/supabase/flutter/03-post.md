---
name: "Let Signed-In Users Post"
description: "Let signed-in users post, with a policy that only lets them post as themselves."
order: 3
---

<!-- Generated from Backstage apps/slides/decks/2026-09-28-supabase.md by `pnpm export:md`; edit the deck, not this file. -->

# Let Signed-In Users Post

<!-- prettier-ignore-start -->

## Allow Signed-In Posts

The table and read policy from step 1. The new policy goes at the end.

**Dashboard → SQL Editor** — `supabase/migrations/20260928000000_guestbook.sql`:

Only signed-in users can insert, and `with check (auth.uid() = user_id)` means only as themselves.

```diff
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

`lib/guestbook.dart`:

A `TextEditingController` holds what's typed in a text field.

```diff
 }

 class _GuestbookState extends State<Guestbook> {
+  final _nameController = TextEditingController();
+  final _bodyController = TextEditingController();
+
   Session? _session;
   List<Map<String, dynamic>> _messages = [];

```

`dispose` frees the controllers when the widget goes away.

```diff
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
```

`_submit` is `async`. It reads both fields and stops if either is empty.

```diff

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
```

`await` the insert, then clear the fields and reload the list.

```diff
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
```

`if (session != null) ...[ ]` adds the fields to the column only for signed-in users.

```diff
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
```

Signed-out visitors get a hint instead of the form.

```diff
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
```

[The whole `lib/guestbook.dart` at this point](https://github.com/DevDogsUGA/Mobile-Workshops/blob/191e71aeec4819dfa82c46d12d2e2bcd5e68a4cd/lib/guestbook.dart)

## What's Wrong with This?

The **app** decides whose name goes on each message: type any name you like, and the database stores it. Nothing ties the name to the person who's signed in.

<!-- prettier-ignore-end -->
