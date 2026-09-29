---
name: "Sign In with OAuth"
description: "Register the app with DevDogs, add it as an OIDC provider in Supabase, and add sign-in and sign-out."
order: 2
checkpoint: "02-supabase/02-sign-in"
---

<!-- Generated from Backstage apps/slides/decks/2026-09-28-supabase.md by `pnpm export:md`; edit the deck, not this file. -->

# Sign In with OAuth

<!-- prettier-ignore-start -->

<div class="docs-step-actions">

[Review in VS Code](vscode://devdogsuga.workshops/review?repo=DevDogsUGA%2FWeb-Workshops&to=02-supabase%2F02-sign-in&from=02-supabase%2F01-read)

<details>
<summary>Behind? Catch up to where the last step ended</summary>

**Catch up, keeping your work.** This saves your changes, then brings in the code from the end of the last step. Where you changed the same lines, git asks you which to keep.

```bash cwd=~/Web-Workshops
git fetch origin --tags
# Save your own changes first
git add -A
git commit -m "My work"
# Bring in the code from the end of the last step
git merge --no-edit 02-supabase/01-read
```

**Or start over from the last step.** This moves your branch to the end of the last step. Your changes are lost.

```bash cwd=~/Web-Workshops
git fetch origin --tags
# Moves your branch to the end of the last step
git switch --discard-changes -C <github-username>/02-supabase 02-supabase/01-read
```

</details>

</div>

**OIDC** (OpenID Connect) is a standard built on OAuth 2.0. It lets your app send people to another service to sign in (here, DevDogs), then tells your app who they are.

## Register Your App with DevDogs

1. Go to **devdogsuga.org/tools/oauth** and create a client
1. Redirect URI: your **Project URL** + `/auth/v1/callback`
   - For example, `https://abcdefghij.supabase.co/auth/v1/callback`
1. Copy the **client ID** and **client secret**

## Add the Provider in Supabase

1. Authentication → **Sign In / Providers** → Add a Custom **OIDC** Provider
1. Fill it in, save, and check that it's enabled:

   | Setting              | Value                                |
   | -------------------- | ------------------------------------ |
   | Identifier           | `custom:devdogsuga`                  |
   | Name                 | `DevDogs`                            |
   | Issuer URL           | `https://api.devdogsuga.org/auth/v1` |
   | Client ID and secret | From your DevDogs client             |
   | Scopes               | `openid email profile`               |

## Sign In / Sign Out

Signing in only needs the client we already have: it's all under `supabase.auth`.

`Session` is supabase-js's type for a signed-in user; `null` means nobody's signed in.

```diff file=components/Guestbook.tsx lang=tsx context=6 href=https://github.com/DevDogsUGA/Web-Workshops/compare/469df6f2a496d788b9887ffae477a40995ccc0fd...e0f6d425f0c0032d1a7cd4540a9d1a4440901ce4#diff-7f4f2a0c38fe37a604add3d5767aaccc99567b3379cb7842f526147e60801305 vscode=vscode://devdogsuga.workshops/review?repo=DevDogsUGA%2FWeb-Workshops&to=02-supabase%2F02-sign-in&from=02-supabase%2F01-read&file=components%2FGuestbook.tsx
--- a/components/Guestbook.tsx
+++ b/components/Guestbook.tsx
@@ -1,47 +1,49 @@
 "use client";

 import { useEffect, useState } from "react";
+import type { Session } from "@supabase/supabase-js";
 import { supabase } from "../lib/supabase";

 type Message = {
   id: string;
   user_id: string;
   author_name: string;
   body: string;
   created_at: string;
 };

 export default function Guestbook() {
+  const [session, setSession] = useState<Session | null>(null);
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

`onAuthStateChange` calls back on every sign-in and sign-out. The function `useEffect` returns unsubscribes when the component goes away.

```diff file=components/Guestbook.tsx lang=tsx context=6 href=https://github.com/DevDogsUGA/Web-Workshops/compare/469df6f2a496d788b9887ffae477a40995ccc0fd...e0f6d425f0c0032d1a7cd4540a9d1a4440901ce4#diff-7f4f2a0c38fe37a604add3d5767aaccc99567b3379cb7842f526147e60801305 vscode=vscode://devdogsuga.workshops/review?repo=DevDogsUGA%2FWeb-Workshops&to=02-supabase%2F02-sign-in&from=02-supabase%2F01-read&file=components%2FGuestbook.tsx
--- a/components/Guestbook.tsx
+++ b/components/Guestbook.tsx
@@ -1,49 +1,60 @@
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

+  // Keep track of whether anyone is signed in, and react to sign-in/out.
+  useEffect(() => {
+    supabase.auth.getSession().then(({ data }) => setSession(data.session));
+
+    const { data: subscription } = supabase.auth.onAuthStateChange(
+      (_event, newSession) => setSession(newSession),
+    );
+
+    return () => subscription.subscription.unsubscribe();
+  }, []);
+
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

`signInWithOAuth` sends the browser to DevDogs, then back to `redirectTo`. The cast is there because TypeScript only knows Supabase's built-in providers.

```diff file=components/Guestbook.tsx lang=tsx context=6 href=https://github.com/DevDogsUGA/Web-Workshops/compare/469df6f2a496d788b9887ffae477a40995ccc0fd...e0f6d425f0c0032d1a7cd4540a9d1a4440901ce4#diff-7f4f2a0c38fe37a604add3d5767aaccc99567b3379cb7842f526147e60801305 vscode=vscode://devdogsuga.workshops/review?repo=DevDogsUGA%2FWeb-Workshops&to=02-supabase%2F02-sign-in&from=02-supabase%2F01-read&file=components%2FGuestbook.tsx
--- a/components/Guestbook.tsx
+++ b/components/Guestbook.tsx
@@ -1,60 +1,69 @@
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

+  function signIn() {
+    supabase.auth.signInWithOAuth({
+      // auth-js's Provider type only lists Supabase's built-in providers, so
+      // a custom OIDC provider like ours needs a cast to satisfy it.
+      provider: "custom:devdogsuga" as never,
+      options: { redirectTo: window.location.origin + "/guestbook" },
+    });
+  }
+
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

`signOut` ends the session, and `onAuthStateChange` updates the page.

```diff file=components/Guestbook.tsx lang=tsx context=6 href=https://github.com/DevDogsUGA/Web-Workshops/compare/469df6f2a496d788b9887ffae477a40995ccc0fd...e0f6d425f0c0032d1a7cd4540a9d1a4440901ce4#diff-7f4f2a0c38fe37a604add3d5767aaccc99567b3379cb7842f526147e60801305 vscode=vscode://devdogsuga.workshops/review?repo=DevDogsUGA%2FWeb-Workshops&to=02-supabase%2F02-sign-in&from=02-supabase%2F01-read&file=components%2FGuestbook.tsx
--- a/components/Guestbook.tsx
+++ b/components/Guestbook.tsx
@@ -1,69 +1,73 @@
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

+  function signOut() {
+    supabase.auth.signOut();
+  }
+
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

`{session ? … : …}` in JSX picks which button to show.

```diff file=components/Guestbook.tsx lang=tsx context=6 href=https://github.com/DevDogsUGA/Web-Workshops/compare/469df6f2a496d788b9887ffae477a40995ccc0fd...e0f6d425f0c0032d1a7cd4540a9d1a4440901ce4#diff-7f4f2a0c38fe37a604add3d5767aaccc99567b3379cb7842f526147e60801305 vscode=vscode://devdogsuga.workshops/review?repo=DevDogsUGA%2FWeb-Workshops&to=02-supabase%2F02-sign-in&from=02-supabase%2F01-read&file=components%2FGuestbook.tsx
--- a/components/Guestbook.tsx
+++ b/components/Guestbook.tsx
@@ -1,73 +1,83 @@
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
+      {session ? (
+        <button
+          onClick={signOut}
+          className="rounded-lg border border-gray-300 px-4 py-2"
+        >
+          Sign out
+        </button>
+      ) : (
+        <button
+          onClick={signIn}
       <p className="mt-2 text-sm text-gray-500">
         Anyone can read the guestbook below. Sign-in is coming next.
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

The note under the buttons now says what's coming next.

```diff file=components/Guestbook.tsx lang=tsx context=6 href=https://github.com/DevDogsUGA/Web-Workshops/compare/469df6f2a496d788b9887ffae477a40995ccc0fd...e0f6d425f0c0032d1a7cd4540a9d1a4440901ce4#diff-7f4f2a0c38fe37a604add3d5767aaccc99567b3379cb7842f526147e60801305 vscode=vscode://devdogsuga.workshops/review?repo=DevDogsUGA%2FWeb-Workshops&to=02-supabase%2F02-sign-in&from=02-supabase%2F01-read&file=components%2FGuestbook.tsx
--- a/components/Guestbook.tsx
+++ b/components/Guestbook.tsx
@@ -1,83 +1,89 @@
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
+          className="rounded-lg bg-black px-4 py-2 text-white"
+        >
+          Sign in with DevDogs
+        </button>
+      )}
+
       <p className="mt-2 text-sm text-gray-500">
-        Anyone can read the guestbook below. Sign-in is coming next.
+        Anyone can read the guestbook below. Posting is coming next.
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

[The whole `components/Guestbook.tsx` at this point](https://github.com/DevDogsUGA/Web-Workshops/blob/e0f6d425f0c0032d1a7cd4540a9d1a4440901ce4/components/Guestbook.tsx)

<!-- prettier-ignore-end -->
