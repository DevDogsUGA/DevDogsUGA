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

`components/Guestbook.tsx`:

No more name field: its state, its reset, and the input all go.

```diff
 export default function Guestbook() {
   const [session, setSession] = useState<Session | null>(null);
   const [messages, setMessages] = useState<Message[]>([]);
-  const [name, setName] = useState("");
   const [body, setBody] = useState("");

   // Keep track of whether anyone is signed in, and react to sign-in/out.
@@

     if (!error && data) {
       setMessages([data, ...messages]);
-      setName("");
       setBody("");
     }
   }
@@

       {session && (
         <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
-          <input
-            type="text"
-            value={name}
-            onChange={(event) => setName(event.target.value)}
-            placeholder="Your name"
-            className="rounded-lg border border-gray-300 px-3 py-2"
-          />
           <textarea
             value={body}
             onChange={(event) => setBody(event.target.value)}
```

Only the message is required now.

```diff

   async function handleSubmit(event: React.FormEvent) {
     event.preventDefault();
-
-    // Reject empty entries (after trimming whitespace).
-    if (!session || name.trim() === "" || body.trim() === "") {
+    if (!session || body.trim() === "") {
       return;
     }

```

The insert sends just the message. `profiles(name)` embeds the author's profile in the row that comes back.

```diff
       return;
     }

-    // The name is whatever the signed-in user typed into the field below.
-    // (Step 4 of the workshop looks this up server-side instead.)
+    // The name is looked up server-side from public.profiles (set once, at
+    // sign-up) -- we never send it from the client, so no one can post
+    // under a name that isn't theirs.
     const { data, error } = await supabase
       .from("messages")
-      .insert({ author_name: name.trim(), body: body.trim() })
-      .select("id, user_id, author_name, body, created_at")
-      .single();
+      .insert({ body: body.trim() })
+      .select("id, user_id, body, created_at, profiles(name)")
+      .single()
+      // Same reasoning as the list query above -- this is a single row, and
+      // its embedded profile is a single object, not an array.
+      .overrideTypes<Message, { merge: false }>();

     if (!error && data) {
       setMessages([data, ...messages]);
```

## Showing the Author's Name

Names live in `profiles` now, so the page fetches them along with each message.

`components/Guestbook.tsx`:

`profiles` replaces `author_name` in the `Message` type: one object, or `null`.

```diff
 type Message = {
   id: string;
   user_id: string;
-  author_name: string;
   body: string;
   created_at: string;
+  // Embedded from public.profiles via the messages -> profiles foreign key.
+  // messages.user_id -> profiles.id is many-to-one, so PostgREST returns a
+  // single object here (or null) -- never an array.
+  profiles: { name: string } | null;
 };

 export default function Guestbook() {
```

`profiles(name)` embeds the author's profile through the foreign key. `overrideTypes` tells TypeScript it's one object, not a list.

```diff
   useEffect(() => {
     supabase
       .from("messages")
-      .select("id, user_id, author_name, body, created_at")
+      .select("id, user_id, body, created_at, profiles(name)")
       .order("created_at", { ascending: false })
+      // Without generated database types, supabase-js guesses `profiles` is
+      // an array; a many-to-one embed is actually a single object, so we
+      // tell it the real shape here.
+      .overrideTypes<Message[], { merge: false }>()
       .then(({ data }) => setMessages(data ?? []));
   }, []);

```

`?.` and `??`: show the profile's name if there is one, otherwise "Unknown".

```diff
         {messages.map((message) => (
           <li key={message.id} className="rounded-lg border border-gray-200 p-4">
             <div className="flex items-baseline justify-between">
-              <h2 className="font-semibold">{message.author_name}</h2>
+              <h2 className="font-semibold">{message.profiles?.name ?? "Unknown"}</h2>
               <span className="text-sm text-gray-500">
                 {new Date(message.created_at).toLocaleTimeString()}
               </span>
```

[The whole `components/Guestbook.tsx` at this point](https://github.com/DevDogsUGA/Web-Workshops/blob/cd01fa1e5cad6019bb5315f8c30a960c6646fd39/components/Guestbook.tsx)

<!-- prettier-ignore-end -->
