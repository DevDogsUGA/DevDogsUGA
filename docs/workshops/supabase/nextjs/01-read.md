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

[Review in VS Code](vscode://devdogsuga.workshops/review?repo=DevDogsUGA%2FWeb-Workshops&to=02-supabase%2F01-read&from=02-supabase%2F00-start)

<details>
<summary>Behind? Catch up to where the last step ended</summary>

**Catch up, keeping your work.** This saves your changes, then brings in the code from the end of the last step. `git commit` needs your name and email set once: see [Git and a GitHub account](/docs/workshops/getting-started/prerequisites#git-and-a-github-account).

```bash cwd=~/Web-Workshops
git fetch origin --tags
# Save your own changes first (fine if there's nothing to save)
git add -A
git commit -m "My work"
# Bring in the code from the end of the last step
git merge --no-edit 02-supabase/00-start
```

Where you and the step changed the same lines, the merge stops with a conflict. Open each file git lists, keep the code you want between the `<<<<<<<` and `>>>>>>>` markers, delete the markers, then finish with `git add -A` and `git commit --no-edit`. To back out instead, run `git merge --abort`.

**Or start over from the last step.** This moves your branch to the end of the last step. Your changes to the step's files are lost; new files you made stay. If you're in the middle of a merge, run `git merge --abort` first.

```bash cwd=~/Web-Workshops
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

```bash cwd=~/Web-Workshops
# Add the Supabase client
pnpm add @supabase/supabase-js
```

## Connect to Supabase

`"use client"` marks this module for the browser: the Supabase client runs in the page.

```ts file=lib/supabase.ts lines=1-5 href=https://github.com/DevDogsUGA/Web-Workshops/blob/469df6f2a496d788b9887ffae477a40995ccc0fd/lib/supabase.ts#L1-L5 vscode=vscode://devdogsuga.workshops/open?repo=DevDogsUGA%2FWeb-Workshops&ref=02-supabase%2F01-read&file=lib%2Fsupabase.ts&lines=1-5
"use client";

// A single Supabase client for the browser. Every client component
// that talks to Supabase imports this instead of creating its own.
import { createClient } from "@supabase/supabase-js";
```

`process.env.NEXT_PUBLIC_…` reads the values from `.env.local`. Next.js only hands the browser variables that start with `NEXT_PUBLIC_`.

```ts file=lib/supabase.ts lines=7-8 href=https://github.com/DevDogsUGA/Web-Workshops/blob/469df6f2a496d788b9887ffae477a40995ccc0fd/lib/supabase.ts#L7-L8 vscode=vscode://devdogsuga.workshops/open?repo=DevDogsUGA%2FWeb-Workshops&ref=02-supabase%2F01-read&file=lib%2Fsupabase.ts&lines=7-8
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
```

`createClient` builds one Supabase client, and every component imports this same one.

```ts file=lib/supabase.ts lines=10 href=https://github.com/DevDogsUGA/Web-Workshops/blob/469df6f2a496d788b9887ffae477a40995ccc0fd/lib/supabase.ts#L10-L10 vscode=vscode://devdogsuga.workshops/open?repo=DevDogsUGA%2FWeb-Workshops&ref=02-supabase%2F01-read&file=lib%2Fsupabase.ts&lines=10
export const supabase = createClient(supabaseUrl, supabasePublishableKey);
```

```ts file=lib/supabase.ts lines=1-10 href=https://github.com/DevDogsUGA/Web-Workshops/blob/469df6f2a496d788b9887ffae477a40995ccc0fd/lib/supabase.ts vscode=vscode://devdogsuga.workshops/open?repo=DevDogsUGA%2FWeb-Workshops&ref=02-supabase%2F01-read&file=lib%2Fsupabase.ts
"use client";

// A single Supabase client for the browser. Every client component
// that talks to Supabase imports this instead of creating its own.
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

export const supabase = createClient(supabaseUrl, supabasePublishableKey);
```

## From In-Memory to Supabase

The guestbook from Framework Intros kept entries in memory, so they vanished on refresh.

`type Message` describes one row of the `messages` table, so TypeScript can check how we use it.

```diff file=components/Guestbook.tsx lang=tsx context=6 href=https://github.com/DevDogsUGA/Web-Workshops/compare/bd3068777f51e91e40c27888418eda4cadcd78c7...469df6f2a496d788b9887ffae477a40995ccc0fd#diff-7f4f2a0c38fe37a604add3d5767aaccc99567b3379cb7842f526147e60801305 vscode=vscode://devdogsuga.workshops/review?repo=DevDogsUGA%2FWeb-Workshops&to=02-supabase%2F01-read&from=02-supabase%2F00-start&file=components%2FGuestbook.tsx
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

```diff file=components/Guestbook.tsx lang=tsx context=6 href=https://github.com/DevDogsUGA/Web-Workshops/compare/bd3068777f51e91e40c27888418eda4cadcd78c7...469df6f2a496d788b9887ffae477a40995ccc0fd#diff-7f4f2a0c38fe37a604add3d5767aaccc99567b3379cb7842f526147e60801305 vscode=vscode://devdogsuga.workshops/review?repo=DevDogsUGA%2FWeb-Workshops&to=02-supabase%2F01-read&from=02-supabase%2F00-start&file=components%2FGuestbook.tsx
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

```diff file=components/Guestbook.tsx lang=tsx context=6 href=https://github.com/DevDogsUGA/Web-Workshops/compare/bd3068777f51e91e40c27888418eda4cadcd78c7...469df6f2a496d788b9887ffae477a40995ccc0fd#diff-7f4f2a0c38fe37a604add3d5767aaccc99567b3379cb7842f526147e60801305 vscode=vscode://devdogsuga.workshops/review?repo=DevDogsUGA%2FWeb-Workshops&to=02-supabase%2F01-read&from=02-supabase%2F00-start&file=components%2FGuestbook.tsx
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

```diff file=components/Guestbook.tsx lang=tsx context=6 href=https://github.com/DevDogsUGA/Web-Workshops/compare/bd3068777f51e91e40c27888418eda4cadcd78c7...469df6f2a496d788b9887ffae477a40995ccc0fd#diff-7f4f2a0c38fe37a604add3d5767aaccc99567b3379cb7842f526147e60801305 vscode=vscode://devdogsuga.workshops/review?repo=DevDogsUGA%2FWeb-Workshops&to=02-supabase%2F01-read&from=02-supabase%2F00-start&file=components%2FGuestbook.tsx
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

```diff file=components/Guestbook.tsx lang=tsx context=6 href=https://github.com/DevDogsUGA/Web-Workshops/compare/bd3068777f51e91e40c27888418eda4cadcd78c7...469df6f2a496d788b9887ffae477a40995ccc0fd#diff-7f4f2a0c38fe37a604add3d5767aaccc99567b3379cb7842f526147e60801305 vscode=vscode://devdogsuga.workshops/review?repo=DevDogsUGA%2FWeb-Workshops&to=02-supabase%2F01-read&from=02-supabase%2F00-start&file=components%2FGuestbook.tsx
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

```diff file=components/Guestbook.tsx lang=tsx context=6 href=https://github.com/DevDogsUGA/Web-Workshops/compare/bd3068777f51e91e40c27888418eda4cadcd78c7...469df6f2a496d788b9887ffae477a40995ccc0fd#diff-7f4f2a0c38fe37a604add3d5767aaccc99567b3379cb7842f526147e60801305 vscode=vscode://devdogsuga.workshops/review?repo=DevDogsUGA%2FWeb-Workshops&to=02-supabase%2F01-read&from=02-supabase%2F00-start&file=components%2FGuestbook.tsx
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

[The whole `components/Guestbook.tsx` at this point](https://github.com/DevDogsUGA/Web-Workshops/blob/469df6f2a496d788b9887ffae477a40995ccc0fd/components/Guestbook.tsx)

<!-- prettier-ignore-end -->
