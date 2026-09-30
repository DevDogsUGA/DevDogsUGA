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

[Review in VS Code](vscode://devdogsuga.workshops/review?repo=DevDogsUGA%2FWeb-Workshops&to=02-supabase%2F05-delete&from=02-supabase%2F04-profiles)

<details>
<summary>Behind? Catch up to where the last step ended</summary>

**Catch up, keeping your work.** This saves your changes, then brings in the code from the end of the last step. Where you changed the same lines, git asks you which to keep.

```bash cwd=~/Web-Workshops
git fetch origin --tags
# Save your own changes first
git add -A
git commit -m "My work"
# Bring in the code from the end of the last step
git merge --no-edit 02-supabase/04-profiles
```

**Or start over from the last step.** This moves your branch to the end of the last step. Your changes are lost.

```bash cwd=~/Web-Workshops
git fetch origin --tags
# Moves your branch to the end of the last step
git switch --discard-changes -C <github-username>/02-supabase 02-supabase/04-profiles
```

</details>

</div>

## Let Users Delete Their Own Messages

**Dashboard → SQL Editor**:

One more policy, at the end.

Signed-in users can delete a message only when it's theirs. There's no update policy, on purpose.

```diff file=supabase/migrations/20260928000000_guestbook.sql lang=sql context=6 href=https://github.com/DevDogsUGA/Web-Workshops/compare/6fc4e76029e55c0299adc31cb9b570101023b3d1...8f26e3ad3d31168d85c4e4b402f59da66376522f#diff-5d1eb0c93f905e8db60c6bf0111f6a064ec9a44666f86a14842c382c1b354ae1 vscode=vscode://devdogsuga.workshops/review?repo=DevDogsUGA%2FWeb-Workshops&to=02-supabase%2F05-delete&from=02-supabase%2F04-profiles&file=supabase%2Fmigrations%2F20260928000000_guestbook.sql
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

[The whole `supabase/migrations/20260928000000_guestbook.sql` at this point](https://github.com/DevDogsUGA/Web-Workshops/blob/8f26e3ad3d31168d85c4e4b402f59da66376522f/supabase/migrations/20260928000000_guestbook.sql)

## Only Your Own Delete Button

Deleting takes a handler and a button, shown only on your own messages.

`.delete().eq("id", id)` deletes the matching row (RLS refuses anyone else's), then drops it from the list.

```diff file=components/Guestbook.tsx lang=tsx context=6 href=https://github.com/DevDogsUGA/Web-Workshops/compare/6fc4e76029e55c0299adc31cb9b570101023b3d1...8f26e3ad3d31168d85c4e4b402f59da66376522f#diff-7f4f2a0c38fe37a604add3d5767aaccc99567b3379cb7842f526147e60801305 vscode=vscode://devdogsuga.workshops/review?repo=DevDogsUGA%2FWeb-Workshops&to=02-supabase%2F05-delete&from=02-supabase%2F04-profiles&file=components%2FGuestbook.tsx
--- a/components/Guestbook.tsx
+++ b/components/Guestbook.tsx
@@ -1,140 +1,147 @@
 "use client";

 import { useEffect, useState } from "react";
 import type { Session } from "@supabase/supabase-js";
 import { supabase } from "../lib/supabase";

 type Message = {
   id: string;
   user_id: string;
   body: string;
   created_at: string;
   // Embedded from public.profiles via the messages -> profiles foreign key.
   // messages.user_id -> profiles.id is many-to-one, so PostgREST returns a
   // single object here (or null) -- never an array.
   profiles: { name: string } | null;
 };

 export default function Guestbook() {
   const [session, setSession] = useState<Session | null>(null);
   const [messages, setMessages] = useState<Message[]>([]);
   const [body, setBody] = useState("");

   // Keep track of whether anyone is signed in, and react to sign-in/out.
   useEffect(() => {
     supabase.auth.getSession().then(({ data }) => setSession(data.session));

     const { data: subscription } = supabase.auth.onAuthStateChange(
       (_event, newSession) => setSession(newSession),
     );

     return () => subscription.subscription.unsubscribe();
   }, []);

   // Load the guestbook, newest first, once on mount.
   useEffect(() => {
     supabase
       .from("messages")
       .select("id, user_id, body, created_at, profiles(name)")
       .order("created_at", { ascending: false })
       // Without generated database types, supabase-js guesses `profiles` is
       // an array; a many-to-one embed is actually a single object, so we
       // tell it the real shape here.
       .overrideTypes<Message[], { merge: false }>()
       .then(({ data }) => setMessages(data ?? []));
   }, []);

   function signIn() {
     supabase.auth.signInWithOAuth({
       // auth-js's Provider type only lists Supabase's built-in providers, so
       // a custom OIDC provider like ours needs a cast to satisfy it.
       provider: "custom:devdogsuga" as never,
       options: { redirectTo: window.location.origin + "/guestbook" },
     });
   }

   function signOut() {
     supabase.auth.signOut();
   }

   async function handleSubmit(event: React.FormEvent) {
     event.preventDefault();
     if (!session || body.trim() === "") {
       return;
     }

     // The name is looked up server-side from public.profiles (set once, at
     // sign-up) -- we never send it from the client, so no one can post
     // under a name that isn't theirs.
     const { data, error } = await supabase
       .from("messages")
       .insert({ body: body.trim() })
       .select("id, user_id, body, created_at, profiles(name)")
       .single()
       // Same reasoning as the list query above -- this is a single row, and
       // its embedded profile is a single object, not an array.
       .overrideTypes<Message, { merge: false }>();

     if (!error && data) {
       setMessages([data, ...messages]);
       setBody("");
     }
   }

+  async function handleDelete(id: string) {
+    const { error } = await supabase.from("messages").delete().eq("id", id);
+    if (!error) {
+      setMessages(messages.filter((message) => message.id !== id));
+    }
+  }
+
   return (
     <div>
       {session ? (
         <button
           onClick={signOut}
           className="rounded-lg border border-gray-300 px-4 py-2"
         >
           Sign out
         </button>
       ) : (
         <button
           onClick={signIn}
           className="rounded-lg bg-black px-4 py-2 text-white"
         >
           Sign in with DevDogs
         </button>
       )}

       {session && (
         <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
           <textarea
             value={body}
             onChange={(event) => setBody(event.target.value)}
             placeholder="Leave a message"
             className="rounded-lg border border-gray-300 px-3 py-2"
           />
           <button
             type="submit"
             className="self-start rounded-lg bg-black px-4 py-2 text-white"
           >
             Sign the guestbook
           </button>
         </form>
       )}

       {!session && (
         <p className="mt-2 text-sm text-gray-500">
           Sign in to leave a message. Anyone can read the guestbook below.
         </p>
       )}

       <ul className="mt-6 space-y-4">
         {messages.map((message) => (
           <li key={message.id} className="rounded-lg border border-gray-200 p-4">
             <div className="flex items-baseline justify-between">
               <h2 className="font-semibold">{message.profiles?.name ?? "Unknown"}</h2>
               <span className="text-sm text-gray-500">
                 {new Date(message.created_at).toLocaleTimeString()}
               </span>
             </div>
             <p className="mt-1 text-gray-600">{message.body}</p>
           </li>
         ))}
       </ul>
     </div>
   );
 }
```

`session?.user.id === message.user_id` shows the button only on your own messages.

```diff file=components/Guestbook.tsx lang=tsx context=6 href=https://github.com/DevDogsUGA/Web-Workshops/compare/6fc4e76029e55c0299adc31cb9b570101023b3d1...8f26e3ad3d31168d85c4e4b402f59da66376522f#diff-7f4f2a0c38fe37a604add3d5767aaccc99567b3379cb7842f526147e60801305 vscode=vscode://devdogsuga.workshops/review?repo=DevDogsUGA%2FWeb-Workshops&to=02-supabase%2F05-delete&from=02-supabase%2F04-profiles&file=components%2FGuestbook.tsx
--- a/components/Guestbook.tsx
+++ b/components/Guestbook.tsx
@@ -1,147 +1,155 @@
 "use client";

 import { useEffect, useState } from "react";
 import type { Session } from "@supabase/supabase-js";
 import { supabase } from "../lib/supabase";

 type Message = {
   id: string;
   user_id: string;
   body: string;
   created_at: string;
   // Embedded from public.profiles via the messages -> profiles foreign key.
   // messages.user_id -> profiles.id is many-to-one, so PostgREST returns a
   // single object here (or null) -- never an array.
   profiles: { name: string } | null;
 };

 export default function Guestbook() {
   const [session, setSession] = useState<Session | null>(null);
   const [messages, setMessages] = useState<Message[]>([]);
   const [body, setBody] = useState("");

   // Keep track of whether anyone is signed in, and react to sign-in/out.
   useEffect(() => {
     supabase.auth.getSession().then(({ data }) => setSession(data.session));

     const { data: subscription } = supabase.auth.onAuthStateChange(
       (_event, newSession) => setSession(newSession),
     );

     return () => subscription.subscription.unsubscribe();
   }, []);

   // Load the guestbook, newest first, once on mount.
   useEffect(() => {
     supabase
       .from("messages")
       .select("id, user_id, body, created_at, profiles(name)")
       .order("created_at", { ascending: false })
       // Without generated database types, supabase-js guesses `profiles` is
       // an array; a many-to-one embed is actually a single object, so we
       // tell it the real shape here.
       .overrideTypes<Message[], { merge: false }>()
       .then(({ data }) => setMessages(data ?? []));
   }, []);

   function signIn() {
     supabase.auth.signInWithOAuth({
       // auth-js's Provider type only lists Supabase's built-in providers, so
       // a custom OIDC provider like ours needs a cast to satisfy it.
       provider: "custom:devdogsuga" as never,
       options: { redirectTo: window.location.origin + "/guestbook" },
     });
   }

   function signOut() {
     supabase.auth.signOut();
   }

   async function handleSubmit(event: React.FormEvent) {
     event.preventDefault();
     if (!session || body.trim() === "") {
       return;
     }

     // The name is looked up server-side from public.profiles (set once, at
     // sign-up) -- we never send it from the client, so no one can post
     // under a name that isn't theirs.
     const { data, error } = await supabase
       .from("messages")
       .insert({ body: body.trim() })
       .select("id, user_id, body, created_at, profiles(name)")
       .single()
       // Same reasoning as the list query above -- this is a single row, and
       // its embedded profile is a single object, not an array.
       .overrideTypes<Message, { merge: false }>();

     if (!error && data) {
       setMessages([data, ...messages]);
       setBody("");
     }
   }

   async function handleDelete(id: string) {
     const { error } = await supabase.from("messages").delete().eq("id", id);
     if (!error) {
       setMessages(messages.filter((message) => message.id !== id));
     }
   }

   return (
     <div>
       {session ? (
         <button
           onClick={signOut}
           className="rounded-lg border border-gray-300 px-4 py-2"
         >
           Sign out
         </button>
       ) : (
         <button
           onClick={signIn}
           className="rounded-lg bg-black px-4 py-2 text-white"
         >
           Sign in with DevDogs
         </button>
       )}

       {session && (
         <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
           <textarea
             value={body}
             onChange={(event) => setBody(event.target.value)}
             placeholder="Leave a message"
             className="rounded-lg border border-gray-300 px-3 py-2"
           />
           <button
             type="submit"
             className="self-start rounded-lg bg-black px-4 py-2 text-white"
           >
             Sign the guestbook
           </button>
         </form>
       )}

       {!session && (
         <p className="mt-2 text-sm text-gray-500">
           Sign in to leave a message. Anyone can read the guestbook below.
         </p>
       )}

       <ul className="mt-6 space-y-4">
         {messages.map((message) => (
           <li key={message.id} className="rounded-lg border border-gray-200 p-4">
             <div className="flex items-baseline justify-between">
               <h2 className="font-semibold">{message.profiles?.name ?? "Unknown"}</h2>
               <span className="text-sm text-gray-500">
                 {new Date(message.created_at).toLocaleTimeString()}
               </span>
             </div>
             <p className="mt-1 text-gray-600">{message.body}</p>
+            {session?.user.id === message.user_id && (
+              <button
+                onClick={() => handleDelete(message.id)}
+                className="mt-2 text-sm text-red-600"
+              >
+                Delete
+              </button>
+            )}
           </li>
         ))}
       </ul>
     </div>
   );
 }
```

[The whole `components/Guestbook.tsx` at this point](https://github.com/DevDogsUGA/Web-Workshops/blob/8f26e3ad3d31168d85c4e4b402f59da66376522f/components/Guestbook.tsx)

<!-- prettier-ignore-end -->
