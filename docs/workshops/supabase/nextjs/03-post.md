---
name: "Let Signed-In Users Post"
description: "Let signed-in users post, with a policy that only lets them post as themselves."
order: 3
---

<!-- Generated from Backstage apps/slides/decks/2026-09-28-supabase.md by `pnpm export:md`; edit the deck, not this file. -->

# Let Signed-In Users Post

<!-- prettier-ignore-start -->

<details>
<summary>Behind? Catch up to where the last step ended</summary>

**Catch up, keeping your work.** This saves your changes, then brings in the code from the end of the last step. Where you changed the same lines, git asks you which to keep.

```bash cwd=~/Web-Workshops
git fetch origin --tags
# Save your own changes first
git add -A
git commit -m "My work"
# Bring in the code from the end of the last step
git merge --no-edit 02-supabase/02-sign-in
```

**Or start over from the last step.** This moves your branch to the end of the last step. Your changes are lost.

```bash cwd=~/Web-Workshops
git fetch origin --tags
# Moves your branch to the end of the last step
git switch --discard-changes -C <github-username>/02-supabase 02-supabase/02-sign-in
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

Controlled inputs: each field's text lives in state (`useState`) and updates on every keystroke.

```diff file=components/Guestbook.tsx lang=tsx context=6 href=https://github.com/DevDogsUGA/Web-Workshops/compare/edc945f9755121c1d6d0ecf54be2ace9c1fc9237...1b91fdba8d5d9f3494b4d1a1ad8c2b702633abfe#diff-7f4f2a0c38fe37a604add3d5767aaccc99567b3379cb7842f526147e60801305
--- a/components/Guestbook.tsx
+++ b/components/Guestbook.tsx
@@ -1,89 +1,91 @@
 "use client";

 import { useEffect, useState } from "react";
 import type { Session } from "@supabase/supabase-js";
 import { supabase } from "../lib/supabase";

 type Message = {
   id: string;
   user_id: string;
   author_name: string;
   body: string;
   created_at: string;
 };

 export default function Guestbook() {
   const [session, setSession] = useState<Session | null>(null);
   const [messages, setMessages] = useState<Message[]>([]);
+  const [name, setName] = useState("");
+  const [body, setBody] = useState("");

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
       .select("id, user_id, author_name, body, created_at")
       .order("created_at", { ascending: false })
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

       <p className="mt-2 text-sm text-gray-500">
         Anyone can read the guestbook below. Posting is coming next.
       </p>

       <ul className="mt-6 space-y-4">
         {messages.map((message) => (
           <li key={message.id} className="rounded-lg border border-gray-200 p-4">
             <div className="flex items-baseline justify-between">
               <h2 className="font-semibold">{message.author_name}</h2>
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

`handleSubmit` is `async`, so it can `await` the database. `preventDefault` stops the browser's own page-reloading submit.

```diff file=components/Guestbook.tsx lang=tsx context=6 href=https://github.com/DevDogsUGA/Web-Workshops/compare/edc945f9755121c1d6d0ecf54be2ace9c1fc9237...1b91fdba8d5d9f3494b4d1a1ad8c2b702633abfe#diff-7f4f2a0c38fe37a604add3d5767aaccc99567b3379cb7842f526147e60801305
--- a/components/Guestbook.tsx
+++ b/components/Guestbook.tsx
@@ -1,91 +1,99 @@
 "use client";

 import { useEffect, useState } from "react";
 import type { Session } from "@supabase/supabase-js";
 import { supabase } from "../lib/supabase";

 type Message = {
   id: string;
   user_id: string;
   author_name: string;
   body: string;
   created_at: string;
 };

 export default function Guestbook() {
   const [session, setSession] = useState<Session | null>(null);
   const [messages, setMessages] = useState<Message[]>([]);
   const [name, setName] = useState("");
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
       .select("id, user_id, author_name, body, created_at")
       .order("created_at", { ascending: false })
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

+  async function handleSubmit(event: React.FormEvent) {
+    event.preventDefault();
+
+    // Reject empty entries (after trimming whitespace).
+    if (!session || name.trim() === "" || body.trim() === "") {
+      return;
+    }
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

       <p className="mt-2 text-sm text-gray-500">
         Anyone can read the guestbook below. Posting is coming next.
       </p>

       <ul className="mt-6 space-y-4">
         {messages.map((message) => (
           <li key={message.id} className="rounded-lg border border-gray-200 p-4">
             <div className="flex items-baseline justify-between">
               <h2 className="font-semibold">{message.author_name}</h2>
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

The insert sends the typed name and the message; `.select().single()` hands back the saved row.

```diff file=components/Guestbook.tsx lang=tsx context=6 href=https://github.com/DevDogsUGA/Web-Workshops/compare/edc945f9755121c1d6d0ecf54be2ace9c1fc9237...1b91fdba8d5d9f3494b4d1a1ad8c2b702633abfe#diff-7f4f2a0c38fe37a604add3d5767aaccc99567b3379cb7842f526147e60801305
--- a/components/Guestbook.tsx
+++ b/components/Guestbook.tsx
@@ -1,99 +1,107 @@
 "use client";

 import { useEffect, useState } from "react";
 import type { Session } from "@supabase/supabase-js";
 import { supabase } from "../lib/supabase";

 type Message = {
   id: string;
   user_id: string;
   author_name: string;
   body: string;
   created_at: string;
 };

 export default function Guestbook() {
   const [session, setSession] = useState<Session | null>(null);
   const [messages, setMessages] = useState<Message[]>([]);
   const [name, setName] = useState("");
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
       .select("id, user_id, author_name, body, created_at")
       .order("created_at", { ascending: false })
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

     // Reject empty entries (after trimming whitespace).
     if (!session || name.trim() === "" || body.trim() === "") {
       return;
     }

+    // The name is whatever the signed-in user typed into the field below.
+    // (Step 4 of the workshop looks this up server-side instead.)
+    const { data, error } = await supabase
+      .from("messages")
+      .insert({ author_name: name.trim(), body: body.trim() })
+      .select("id, user_id, author_name, body, created_at")
+      .single();
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

       <p className="mt-2 text-sm text-gray-500">
         Anyone can read the guestbook below. Posting is coming next.
       </p>

       <ul className="mt-6 space-y-4">
         {messages.map((message) => (
           <li key={message.id} className="rounded-lg border border-gray-200 p-4">
             <div className="flex items-baseline justify-between">
               <h2 className="font-semibold">{message.author_name}</h2>
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

Put the new row at the top of the list and clear the form.

```diff file=components/Guestbook.tsx lang=tsx context=6 href=https://github.com/DevDogsUGA/Web-Workshops/compare/edc945f9755121c1d6d0ecf54be2ace9c1fc9237...1b91fdba8d5d9f3494b4d1a1ad8c2b702633abfe#diff-7f4f2a0c38fe37a604add3d5767aaccc99567b3379cb7842f526147e60801305
--- a/components/Guestbook.tsx
+++ b/components/Guestbook.tsx
@@ -1,107 +1,114 @@
 "use client";

 import { useEffect, useState } from "react";
 import type { Session } from "@supabase/supabase-js";
 import { supabase } from "../lib/supabase";

 type Message = {
   id: string;
   user_id: string;
   author_name: string;
   body: string;
   created_at: string;
 };

 export default function Guestbook() {
   const [session, setSession] = useState<Session | null>(null);
   const [messages, setMessages] = useState<Message[]>([]);
   const [name, setName] = useState("");
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
       .select("id, user_id, author_name, body, created_at")
       .order("created_at", { ascending: false })
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

     // Reject empty entries (after trimming whitespace).
     if (!session || name.trim() === "" || body.trim() === "") {
       return;
     }

     // The name is whatever the signed-in user typed into the field below.
     // (Step 4 of the workshop looks this up server-side instead.)
     const { data, error } = await supabase
       .from("messages")
       .insert({ author_name: name.trim(), body: body.trim() })
       .select("id, user_id, author_name, body, created_at")
       .single();

+    if (!error && data) {
+      setMessages([data, ...messages]);
+      setName("");
+      setBody("");
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

       <p className="mt-2 text-sm text-gray-500">
         Anyone can read the guestbook below. Posting is coming next.
       </p>

       <ul className="mt-6 space-y-4">
         {messages.map((message) => (
           <li key={message.id} className="rounded-lg border border-gray-200 p-4">
             <div className="flex items-baseline justify-between">
               <h2 className="font-semibold">{message.author_name}</h2>
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

`{session && (…)}` shows the form only to signed-in users; `onChange` copies each keystroke into state.

```diff file=components/Guestbook.tsx lang=tsx context=6 href=https://github.com/DevDogsUGA/Web-Workshops/compare/edc945f9755121c1d6d0ecf54be2ace9c1fc9237...1b91fdba8d5d9f3494b4d1a1ad8c2b702633abfe#diff-7f4f2a0c38fe37a604add3d5767aaccc99567b3379cb7842f526147e60801305
--- a/components/Guestbook.tsx
+++ b/components/Guestbook.tsx
@@ -1,114 +1,121 @@
 "use client";

 import { useEffect, useState } from "react";
 import type { Session } from "@supabase/supabase-js";
 import { supabase } from "../lib/supabase";

 type Message = {
   id: string;
   user_id: string;
   author_name: string;
   body: string;
   created_at: string;
 };

 export default function Guestbook() {
   const [session, setSession] = useState<Session | null>(null);
   const [messages, setMessages] = useState<Message[]>([]);
   const [name, setName] = useState("");
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
       .select("id, user_id, author_name, body, created_at")
       .order("created_at", { ascending: false })
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

     // Reject empty entries (after trimming whitespace).
     if (!session || name.trim() === "" || body.trim() === "") {
       return;
     }

     // The name is whatever the signed-in user typed into the field below.
     // (Step 4 of the workshop looks this up server-side instead.)
     const { data, error } = await supabase
       .from("messages")
       .insert({ author_name: name.trim(), body: body.trim() })
       .select("id, user_id, author_name, body, created_at")
       .single();

     if (!error && data) {
       setMessages([data, ...messages]);
       setName("");
       setBody("");
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

-      <p className="mt-2 text-sm text-gray-500">
-        Anyone can read the guestbook below. Posting is coming next.
-      </p>
+      {session && (
+        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
+          <input
+            type="text"
+            value={name}
+            onChange={(event) => setName(event.target.value)}
+            placeholder="Your name"
+            className="rounded-lg border border-gray-300 px-3 py-2"
+          />
+          <textarea

       <ul className="mt-6 space-y-4">
         {messages.map((message) => (
           <li key={message.id} className="rounded-lg border border-gray-200 p-4">
             <div className="flex items-baseline justify-between">
               <h2 className="font-semibold">{message.author_name}</h2>
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

The message box works the same way, and signed-out visitors get a hint instead of the form.

```diff file=components/Guestbook.tsx lang=tsx context=6 href=https://github.com/DevDogsUGA/Web-Workshops/compare/edc945f9755121c1d6d0ecf54be2ace9c1fc9237...1b91fdba8d5d9f3494b4d1a1ad8c2b702633abfe#diff-7f4f2a0c38fe37a604add3d5767aaccc99567b3379cb7842f526147e60801305
--- a/components/Guestbook.tsx
+++ b/components/Guestbook.tsx
@@ -1,121 +1,140 @@
 "use client";

 import { useEffect, useState } from "react";
 import type { Session } from "@supabase/supabase-js";
 import { supabase } from "../lib/supabase";

 type Message = {
   id: string;
   user_id: string;
   author_name: string;
   body: string;
   created_at: string;
 };

 export default function Guestbook() {
   const [session, setSession] = useState<Session | null>(null);
   const [messages, setMessages] = useState<Message[]>([]);
   const [name, setName] = useState("");
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
       .select("id, user_id, author_name, body, created_at")
       .order("created_at", { ascending: false })
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

     // Reject empty entries (after trimming whitespace).
     if (!session || name.trim() === "" || body.trim() === "") {
       return;
     }

     // The name is whatever the signed-in user typed into the field below.
     // (Step 4 of the workshop looks this up server-side instead.)
     const { data, error } = await supabase
       .from("messages")
       .insert({ author_name: name.trim(), body: body.trim() })
       .select("id, user_id, author_name, body, created_at")
       .single();

     if (!error && data) {
       setMessages([data, ...messages]);
       setName("");
       setBody("");
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
           <input
             type="text"
             value={name}
             onChange={(event) => setName(event.target.value)}
             placeholder="Your name"
             className="rounded-lg border border-gray-300 px-3 py-2"
           />
           <textarea
+            value={body}
+            onChange={(event) => setBody(event.target.value)}
+            placeholder="Leave a message"
+            className="rounded-lg border border-gray-300 px-3 py-2"
+          />
+          <button
+            type="submit"
+            className="self-start rounded-lg bg-black px-4 py-2 text-white"
+          >
+            Sign the guestbook
+          </button>
+        </form>
+      )}
+
+      {!session && (
+        <p className="mt-2 text-sm text-gray-500">
+          Sign in to leave a message. Anyone can read the guestbook below.
+        </p>
+      )}

       <ul className="mt-6 space-y-4">
         {messages.map((message) => (
           <li key={message.id} className="rounded-lg border border-gray-200 p-4">
             <div className="flex items-baseline justify-between">
               <h2 className="font-semibold">{message.author_name}</h2>
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

[The whole `components/Guestbook.tsx` at this point](https://github.com/DevDogsUGA/Web-Workshops/blob/1b91fdba8d5d9f3494b4d1a1ad8c2b702633abfe/components/Guestbook.tsx)

## What's Wrong with This?

The **app** decides whose name goes on each message: type any name you like, and the database stores it. Nothing ties the name to the person who's signed in.

<!-- prettier-ignore-end -->
