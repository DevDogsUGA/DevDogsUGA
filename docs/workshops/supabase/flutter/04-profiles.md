---
name: "Store Names on the Server"
description: "Move display names into a profiles table the server fills in, so the app stops trusting the client."
order: 4
---

<!-- Generated from Backstage apps/slides/decks/2026-09-28-supabase.md by `pnpm export:md`; edit the deck, not this file. -->

# Store Names on the Server

<!-- prettier-ignore-start -->

Store each person's name once, on the server, when they sign up. Every message then shows the name from their account, and the app stops sending a name at all.

## Move Names into Profiles

**Dashboard → SQL Editor** — `supabase/migrations/20260928000100_profiles.sql`:

A `profiles` table: one row per person, keyed by their `auth.users` id.

```sql
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null
);

alter table public.profiles enable row level security;
```

Names are public, so everyone can read profiles. There's no write policy: only the trigger below writes here.

```sql
-- Names are public (they show up next to every message), but nobody can
-- write to this table directly -- only the trigger below does that.
create policy "profiles are readable by everyone"
  on public.profiles
  for select
  to anon, authenticated
  using (true);
```

A function that runs as its owner (`security definer`), so it can write a profile the signed-in user can't.

```sql
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
```

It inserts one profile for each new user…

```sql
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'name',
      new.raw_user_meta_data ->> 'full_name',
```

…named by `coalesce`: the first of `name`, `full_name`, `preferred_username`, or the start of the email.

```sql
      new.raw_user_meta_data ->> 'preferred_username',
      split_part(new.email, '@', 1)
    )
  );
  return new;
end;
$$;
```

The trigger runs that function every time someone signs up.

```sql
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

The backfill gives everyone who signed up before tonight a profile too.

```sql
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

```sql
-- Messages now point at profiles (not auth.users directly), so PostgREST
-- can embed `profiles(name)` in a single select. The client can no longer
-- send its own author_name -- the name always comes from the server.
alter table public.messages
  add constraint messages_user_id_profiles_fkey
  foreign key (user_id) references public.profiles (id) on delete cascade;

alter table public.messages drop column author_name;
```

[The whole `supabase/migrations/20260928000100_profiles.sql` at this point](https://github.com/DevDogsUGA/Web-Workshops/blob/cd01fa1e5cad6019bb5315f8c30a960c6646fd39/supabase/migrations/20260928000100_profiles.sql)

## One Name per Account

No more name field: its controller, its `dispose` call, and the `TextField` go.

```diff file=lib/guestbook.dart lang=dart
--- a/lib/guestbook.dart
+++ b/lib/guestbook.dart
@@ -19,7 +19,6 @@
 }

 class _GuestbookState extends State<Guestbook> {
-  final _nameController = TextEditingController();
   final _bodyController = TextEditingController();

   Session? _session;
@@ -40,7 +39,6 @@

   @override
   void dispose() {
-    _nameController.dispose();
     _bodyController.dispose();
     super.dispose();
   }
@@ -72,6 +70,5 @@
   Future<void> _signOut() => _supabase.auth.signOut();

   Future<void> _submit() async {
-    final name = _nameController.text.trim();
     final body = _bodyController.text.trim();
     final session = _session;
@@ -87,5 +83,4 @@

-    _nameController.clear();
     _bodyController.clear();
     await _loadMessages();
   }
@@ -113,15 +108,10 @@
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
```

Only the message is required now.

```diff file=lib/guestbook.dart lang=dart
--- a/lib/guestbook.dart
+++ b/lib/guestbook.dart
@@ -76,8 +73,6 @@
     final body = _bodyController.text.trim();
     final session = _session;
-
-    // Reject the entry if either field is empty once whitespace is trimmed.
-    if (session == null || name.isEmpty || body.isEmpty) {
+    if (session == null || body.isEmpty) {
       return;
     }

```

The insert sends just the message; the server knows who's signed in.

```diff file=lib/guestbook.dart lang=dart
--- a/lib/guestbook.dart
+++ b/lib/guestbook.dart
@@ -81,7 +76,8 @@
       return;
     }

-    // The name is whatever the signed-in user typed into the field below.
-    // (The next commit looks this up server-side instead.)
-    await _supabase.from('messages').insert({'author_name': name, 'body': body});
+    // The name is looked up server-side from public.profiles (set once, at
+    // sign-up) -- we never send it from the client, so no one can post
+    // under a name that isn't theirs.
+    await _supabase.from('messages').insert({'body': body});

```

## Showing the Author's Name

Names live in `profiles` now, so the app fetches them along with each message.

`profiles(name)` embeds the author's profile through the foreign key, in the same query.

```diff file=lib/guestbook.dart lang=dart
--- a/lib/guestbook.dart
+++ b/lib/guestbook.dart
@@ -50,7 +48,7 @@
     try {
       final rows = await _supabase
           .from('messages')
-          .select('id, user_id, author_name, body, created_at')
+          .select('id, user_id, body, created_at, profiles(name)')
           .order('created_at', ascending: false);
       if (mounted) {
         setState(() => _messages = List<Map<String, dynamic>>.from(rows));
```

The profile arrives as a `Map` (or `null`); `?.` and `??` fall back to "Unknown".

```diff file=lib/guestbook.dart lang=dart
--- a/lib/guestbook.dart
+++ b/lib/guestbook.dart
@@ -139,4 +129,11 @@
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
```

The tile's title shows that name.

```diff file=lib/guestbook.dart lang=dart
--- a/lib/guestbook.dart
+++ b/lib/guestbook.dart
@@ -142,5 +139,5 @@
                   return ListTile(
-                    title: Text(message['author_name'] as String),
+                    title: Text(authorName),
                     subtitle: Text(message['body'] as String),
                     trailing: Text(_formatTime(message['created_at'] as String)),
                   );
```

[The whole `lib/guestbook.dart` at this point](https://github.com/DevDogsUGA/Mobile-Workshops/blob/3b10b23bff5732a6487ba58887feab9a3d5c5f7c/lib/guestbook.dart)

<!-- prettier-ignore-end -->
