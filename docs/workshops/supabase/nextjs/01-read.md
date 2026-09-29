---
name: "Read the Guestbook"
description: "Create the messages table with row-level security, and load the guestbook from Supabase."
order: 1
---

<!-- Generated from Backstage apps/slides/decks/2026-09-28-supabase.md by `pnpm export:md`; edit the deck, not this file. -->

# Read the Guestbook

<!-- prettier-ignore-start -->

<details>
<summary>Behind? Start from where the last step ended</summary>

These put your copy of the workshop code exactly where the previous step left it.

```bash cwd=~/Web-Workshops
# Throws away your changes to the workshop code
git switch --discard-changes 01-nextjs-intro
```

</details>

The guestbook is the part we didn't get to at Setup Night. It's already in your starter code, keeping messages in memory. Now we'll give it a real database.

## Create the Messages Table

**Dashboard → SQL Editor**:

`create table` makes the `messages` table. `default auth.uid()` fills in `user_id` with whoever is signed in.

```sql file=supabase/migrations/20260928000000_guestbook.sql lines=7-13 href=https://github.com/DevDogsUGA/Web-Workshops/blob/8b11ef05caa8e406de1e718a922562c37da330ed/supabase/migrations/20260928000000_guestbook.sql#L7-L13
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  author_name text not null,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
```

Row-level security goes on: from now on, nobody can read or write a row unless a policy says so.

```sql file=supabase/migrations/20260928000000_guestbook.sql lines=15 href=https://github.com/DevDogsUGA/Web-Workshops/blob/8b11ef05caa8e406de1e718a922562c37da330ed/supabase/migrations/20260928000000_guestbook.sql#L15-L15
alter table public.messages enable row level security;
```

The first policy: anyone, signed in (`authenticated`) or not (`anon`), can read every message.

```sql file=supabase/migrations/20260928000000_guestbook.sql lines=17-22 href=https://github.com/DevDogsUGA/Web-Workshops/blob/8b11ef05caa8e406de1e718a922562c37da330ed/supabase/migrations/20260928000000_guestbook.sql#L17-L22
-- Anyone (signed in or not) can read the guestbook.
create policy "messages are readable by everyone"
  on public.messages
  for select
  to anon, authenticated
  using (true);
```

[The whole `supabase/migrations/20260928000000_guestbook.sql` at this point](https://github.com/DevDogsUGA/Web-Workshops/blob/8b11ef05caa8e406de1e718a922562c37da330ed/supabase/migrations/20260928000000_guestbook.sql)

## Install the Supabase Client

```bash cwd=~/Web-Workshops
# Add the Supabase client
pnpm add @supabase/supabase-js
```

## Connect to Supabase

`"use client"` marks this module for the browser: the Supabase client runs in the page.

```ts file=lib/supabase.ts lines=1-5 href=https://github.com/DevDogsUGA/Web-Workshops/blob/8b11ef05caa8e406de1e718a922562c37da330ed/lib/supabase.ts#L1-L5
"use client";

// A single Supabase client for the browser. Every client component
// that talks to Supabase imports this instead of creating its own.
import { createClient } from "@supabase/supabase-js";
```

`process.env.NEXT_PUBLIC_…` reads the values from `.env.local`. Next.js only hands the browser variables that start with `NEXT_PUBLIC_`.

```ts file=lib/supabase.ts lines=7-8 href=https://github.com/DevDogsUGA/Web-Workshops/blob/8b11ef05caa8e406de1e718a922562c37da330ed/lib/supabase.ts#L7-L8
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
```

`createClient` builds one Supabase client, and every component imports this same one.

```ts file=lib/supabase.ts lines=10 href=https://github.com/DevDogsUGA/Web-Workshops/blob/8b11ef05caa8e406de1e718a922562c37da330ed/lib/supabase.ts#L10-L10
export const supabase = createClient(supabaseUrl, supabasePublishableKey);
```

```ts file=lib/supabase.ts lines=1-10 href=https://github.com/DevDogsUGA/Web-Workshops/blob/8b11ef05caa8e406de1e718a922562c37da330ed/lib/supabase.ts
"use client";

// A single Supabase client for the browser. Every client component
// that talks to Supabase imports this instead of creating its own.
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

export const supabase = createClient(supabaseUrl, supabasePublishableKey);
```

## From In-Memory to Supabase

Setup Night's guestbook kept entries in memory, so they vanished on refresh.

`type Message` describes one row of the `messages` table, so TypeScript can check how we use it.

```diff file=components/Guestbook.tsx lang=tsx context=6 href=https://github.com/DevDogsUGA/Web-Workshops/compare/a0b1b0bb862a395994c3bac3654201747e2f2e72...8b11ef05caa8e406de1e718a922562c37da330ed#diff-7f4f2a0c38fe37a604add3d5767aaccc99567b3379cb7842f526147e60801305
--- a/components/Guestbook.tsx
+++ b/components/Guestbook.tsx
@@ -1,79 +1,82 @@
 "use client";

-import { useState } from "react";
-
-type Entry = {
-  name: string;
-  message: string;
-  postedAt: Date;
+import { useEffect, useState } from "react";
+import { supabase } from "../lib/supabase";
+
+type Message = {
+  id: string;
+  user_id: string;
+  author_name: string;
+  body: string;
+  created_at: string;
 };

 export default function Guestbook() {
   const [entries, setEntries] = useState<Entry[]>([]);
   const [name, setName] = useState("");
   const [message, setMessage] = useState("");

   function handleSubmit(event: React.FormEvent) {
     event.preventDefault();

     // Reject empty entries (after trimming whitespace).
     if (name.trim() === "" || message.trim() === "") {
       return;
     }

     const newEntry: Entry = {
       name: name.trim(),
       message: message.trim(),
       postedAt: new Date(),
     };

     // Newest entries show up first.
     setEntries([newEntry, ...entries]);
     setName("");
     setMessage("");
   }

   return (
     <div>
       <form onSubmit={handleSubmit} className="flex flex-col gap-3">
         <input
           type="text"
           value={name}
           onChange={(event) => setName(event.target.value)}
           placeholder="Your name"
           className="rounded-lg border border-gray-300 px-3 py-2"
         />
         <textarea
           value={message}
           onChange={(event) => setMessage(event.target.value)}
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

       <p className="mt-2 text-sm text-gray-500">
         Entries live only in this browser tab. Refreshing the page clears them.
       </p>

       <ul className="mt-6 space-y-4">
         {entries.map((entry, index) => (
           <li key={index} className="rounded-lg border border-gray-200 p-4">
             <div className="flex items-baseline justify-between">
               <h2 className="font-semibold">{entry.name}</h2>
               <span className="text-sm text-gray-500">
                 {entry.postedAt.toLocaleTimeString()}
               </span>
             </div>
             <p className="mt-1 text-gray-600">{entry.message}</p>
           </li>
         ))}
       </ul>
     </div>
   );
 }
```

`useState` holds the messages this component shows; setting it re-renders the list.

```diff file=components/Guestbook.tsx lang=tsx context=6 href=https://github.com/DevDogsUGA/Web-Workshops/compare/a0b1b0bb862a395994c3bac3654201747e2f2e72...8b11ef05caa8e406de1e718a922562c37da330ed#diff-7f4f2a0c38fe37a604add3d5767aaccc99567b3379cb7842f526147e60801305
--- a/components/Guestbook.tsx
+++ b/components/Guestbook.tsx
@@ -1,82 +1,72 @@
 "use client";

 import { useEffect, useState } from "react";
 import { supabase } from "../lib/supabase";

 type Message = {
   id: string;
   user_id: string;
   author_name: string;
   body: string;
   created_at: string;
 };

 export default function Guestbook() {
-  const [entries, setEntries] = useState<Entry[]>([]);
-  const [name, setName] = useState("");
-  const [message, setMessage] = useState("");
-
-  function handleSubmit(event: React.FormEvent) {
-    event.preventDefault();
-
-    // Reject empty entries (after trimming whitespace).
-    if (name.trim() === "" || message.trim() === "") {
-      return;
-    }
+  const [messages, setMessages] = useState<Message[]>([]);

     const newEntry: Entry = {
       name: name.trim(),
       message: message.trim(),
       postedAt: new Date(),
     };

     // Newest entries show up first.
     setEntries([newEntry, ...entries]);
     setName("");
     setMessage("");
   }

   return (
     <div>
       <form onSubmit={handleSubmit} className="flex flex-col gap-3">
         <input
           type="text"
           value={name}
           onChange={(event) => setName(event.target.value)}
           placeholder="Your name"
           className="rounded-lg border border-gray-300 px-3 py-2"
         />
         <textarea
           value={message}
           onChange={(event) => setMessage(event.target.value)}
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

       <p className="mt-2 text-sm text-gray-500">
         Entries live only in this browser tab. Refreshing the page clears them.
       </p>

       <ul className="mt-6 space-y-4">
         {entries.map((entry, index) => (
           <li key={index} className="rounded-lg border border-gray-200 p-4">
             <div className="flex items-baseline justify-between">
               <h2 className="font-semibold">{entry.name}</h2>
               <span className="text-sm text-gray-500">
                 {entry.postedAt.toLocaleTimeString()}
               </span>
             </div>
             <p className="mt-1 text-gray-600">{entry.message}</p>
           </li>
         ))}
       </ul>
     </div>
   );
 }
```

`useEffect` runs after the first render, and the empty `[]` means just once. It asks Supabase for the rows, newest first.

```diff file=components/Guestbook.tsx lang=tsx context=6 href=https://github.com/DevDogsUGA/Web-Workshops/compare/a0b1b0bb862a395994c3bac3654201747e2f2e72...8b11ef05caa8e406de1e718a922562c37da330ed#diff-7f4f2a0c38fe37a604add3d5767aaccc99567b3379cb7842f526147e60801305
--- a/components/Guestbook.tsx
+++ b/components/Guestbook.tsx
@@ -1,72 +1,69 @@
 "use client";

 import { useEffect, useState } from "react";
 import { supabase } from "../lib/supabase";

 type Message = {
   id: string;
   user_id: string;
   author_name: string;
   body: string;
   created_at: string;
 };

 export default function Guestbook() {
   const [messages, setMessages] = useState<Message[]>([]);

-    const newEntry: Entry = {
-      name: name.trim(),
-      message: message.trim(),
-      postedAt: new Date(),
-    };
-
-    // Newest entries show up first.
-    setEntries([newEntry, ...entries]);
-    setName("");
-    setMessage("");
-  }
+  // Load the guestbook, newest first, once on mount.
+  useEffect(() => {
+    supabase
+      .from("messages")
+      .select("id, user_id, author_name, body, created_at")
+      .order("created_at", { ascending: false })
+      .then(({ data }) => setMessages(data ?? []));
+  }, []);

   return (
     <div>
       <form onSubmit={handleSubmit} className="flex flex-col gap-3">
         <input
           type="text"
           value={name}
           onChange={(event) => setName(event.target.value)}
           placeholder="Your name"
           className="rounded-lg border border-gray-300 px-3 py-2"
         />
         <textarea
           value={message}
           onChange={(event) => setMessage(event.target.value)}
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

       <p className="mt-2 text-sm text-gray-500">
         Entries live only in this browser tab. Refreshing the page clears them.
       </p>

       <ul className="mt-6 space-y-4">
         {entries.map((entry, index) => (
           <li key={index} className="rounded-lg border border-gray-200 p-4">
             <div className="flex items-baseline justify-between">
               <h2 className="font-semibold">{entry.name}</h2>
               <span className="text-sm text-gray-500">
                 {entry.postedAt.toLocaleTimeString()}
               </span>
             </div>
             <p className="mt-1 text-gray-600">{entry.message}</p>
           </li>
         ))}
       </ul>
     </div>
   );
 }
```

The form goes away for now. Posting comes back in step 3, once people can sign in.

```diff file=components/Guestbook.tsx lang=tsx context=6 href=https://github.com/DevDogsUGA/Web-Workshops/compare/a0b1b0bb862a395994c3bac3654201747e2f2e72...8b11ef05caa8e406de1e718a922562c37da330ed#diff-7f4f2a0c38fe37a604add3d5767aaccc99567b3379cb7842f526147e60801305
--- a/components/Guestbook.tsx
+++ b/components/Guestbook.tsx
@@ -1,69 +1,47 @@
 "use client";

 import { useEffect, useState } from "react";
 import { supabase } from "../lib/supabase";

 type Message = {
   id: string;
   user_id: string;
   author_name: string;
   body: string;
   created_at: string;
 };

 export default function Guestbook() {
   const [messages, setMessages] = useState<Message[]>([]);

   // Load the guestbook, newest first, once on mount.
   useEffect(() => {
     supabase
       .from("messages")
       .select("id, user_id, author_name, body, created_at")
       .order("created_at", { ascending: false })
       .then(({ data }) => setMessages(data ?? []));
   }, []);

   return (
     <div>
-      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
-        <input
-          type="text"
-          value={name}
-          onChange={(event) => setName(event.target.value)}
-          placeholder="Your name"
-          className="rounded-lg border border-gray-300 px-3 py-2"
-        />
-        <textarea
-          value={message}
-          onChange={(event) => setMessage(event.target.value)}
-          placeholder="Leave a message"
-          className="rounded-lg border border-gray-300 px-3 py-2"
-        />
-        <button
-          type="submit"
-          className="self-start rounded-lg bg-black px-4 py-2 text-white"
-        >
-          Sign the guestbook
-        </button>
-      </form>
-
       <p className="mt-2 text-sm text-gray-500">
-        Entries live only in this browser tab. Refreshing the page clears them.
+        Anyone can read the guestbook below. Sign-in is coming next.
       </p>

       <ul className="mt-6 space-y-4">
         {entries.map((entry, index) => (
           <li key={index} className="rounded-lg border border-gray-200 p-4">
             <div className="flex items-baseline justify-between">
               <h2 className="font-semibold">{entry.name}</h2>
               <span className="text-sm text-gray-500">
                 {entry.postedAt.toLocaleTimeString()}
               </span>
             </div>
             <p className="mt-1 text-gray-600">{entry.message}</p>
           </li>
         ))}
       </ul>
     </div>
   );
 }
```

`key={message.id}` gives React a stable id for each row, so it can update the list efficiently.

```diff file=components/Guestbook.tsx lang=tsx context=6 href=https://github.com/DevDogsUGA/Web-Workshops/compare/a0b1b0bb862a395994c3bac3654201747e2f2e72...8b11ef05caa8e406de1e718a922562c37da330ed#diff-7f4f2a0c38fe37a604add3d5767aaccc99567b3379cb7842f526147e60801305
--- a/components/Guestbook.tsx
+++ b/components/Guestbook.tsx
@@ -1,47 +1,47 @@
 "use client";

 import { useEffect, useState } from "react";
 import { supabase } from "../lib/supabase";

 type Message = {
   id: string;
   user_id: string;
   author_name: string;
   body: string;
   created_at: string;
 };

 export default function Guestbook() {
   const [messages, setMessages] = useState<Message[]>([]);

   // Load the guestbook, newest first, once on mount.
   useEffect(() => {
     supabase
       .from("messages")
       .select("id, user_id, author_name, body, created_at")
       .order("created_at", { ascending: false })
       .then(({ data }) => setMessages(data ?? []));
   }, []);

   return (
     <div>
       <p className="mt-2 text-sm text-gray-500">
         Anyone can read the guestbook below. Sign-in is coming next.
       </p>

       <ul className="mt-6 space-y-4">
-        {entries.map((entry, index) => (
-          <li key={index} className="rounded-lg border border-gray-200 p-4">
+        {messages.map((message) => (
+          <li key={message.id} className="rounded-lg border border-gray-200 p-4">
             <div className="flex items-baseline justify-between">
-              <h2 className="font-semibold">{entry.name}</h2>
+              <h2 className="font-semibold">{message.author_name}</h2>
               <span className="text-sm text-gray-500">
                 {entry.postedAt.toLocaleTimeString()}
               </span>
             </div>
             <p className="mt-1 text-gray-600">{entry.message}</p>
           </li>
         ))}
       </ul>
     </div>
   );
 }
```

Each field now comes from the database row: `author_name`, `created_at`, and `body`.

```diff file=components/Guestbook.tsx lang=tsx context=6 href=https://github.com/DevDogsUGA/Web-Workshops/compare/a0b1b0bb862a395994c3bac3654201747e2f2e72...8b11ef05caa8e406de1e718a922562c37da330ed#diff-7f4f2a0c38fe37a604add3d5767aaccc99567b3379cb7842f526147e60801305
--- a/components/Guestbook.tsx
+++ b/components/Guestbook.tsx
@@ -1,47 +1,47 @@
 "use client";

 import { useEffect, useState } from "react";
 import { supabase } from "../lib/supabase";

 type Message = {
   id: string;
   user_id: string;
   author_name: string;
   body: string;
   created_at: string;
 };

 export default function Guestbook() {
   const [messages, setMessages] = useState<Message[]>([]);

   // Load the guestbook, newest first, once on mount.
   useEffect(() => {
     supabase
       .from("messages")
       .select("id, user_id, author_name, body, created_at")
       .order("created_at", { ascending: false })
       .then(({ data }) => setMessages(data ?? []));
   }, []);

   return (
     <div>
       <p className="mt-2 text-sm text-gray-500">
         Anyone can read the guestbook below. Sign-in is coming next.
       </p>

       <ul className="mt-6 space-y-4">
         {messages.map((message) => (
           <li key={message.id} className="rounded-lg border border-gray-200 p-4">
             <div className="flex items-baseline justify-between">
               <h2 className="font-semibold">{message.author_name}</h2>
               <span className="text-sm text-gray-500">
-                {entry.postedAt.toLocaleTimeString()}
+                {new Date(message.created_at).toLocaleTimeString()}
               </span>
             </div>
-            <p className="mt-1 text-gray-600">{entry.message}</p>
+            <p className="mt-1 text-gray-600">{message.body}</p>
           </li>
         ))}
       </ul>
     </div>
   );
 }
```

[The whole `components/Guestbook.tsx` at this point](https://github.com/DevDogsUGA/Web-Workshops/blob/8b11ef05caa8e406de1e718a922562c37da330ed/components/Guestbook.tsx)

<!-- prettier-ignore-end -->
