---
name: "Sign In with OAuth"
description: "Register the app with DevDogs, add it as an OIDC provider in Supabase, and add sign-in and sign-out."
order: 2
---

<!-- Generated from Backstage apps/slides/decks/2026-09-28-supabase.md by `pnpm export:md`; edit the deck, not this file. -->

# Sign In with OAuth

<!-- prettier-ignore-start -->

<details>
<summary>Behind? Start from where the last step ended</summary>

These put your copy of the workshop code exactly where the previous step left it.

```bash cwd=~/Web-Workshops
# Get the checkpoint tags
git fetch origin --tags
# Throws away your changes to the workshop code
git switch --detach --discard-changes demo/01-read
```

</details>

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

```diff file=components/Guestbook.tsx lang=tsx
--- a/components/Guestbook.tsx
+++ b/components/Guestbook.tsx
@@ -1,6 +1,7 @@
 "use client";

 import { useEffect, useState } from "react";
+import type { Session } from "@supabase/supabase-js";
 import { supabase } from "../lib/supabase";

 type Message = {
@@ -12,5 +13,6 @@
 };

 export default function Guestbook() {
+  const [session, setSession] = useState<Session | null>(null);
   const [messages, setMessages] = useState<Message[]>([]);

```

`onAuthStateChange` calls back on every sign-in and sign-out. The function `useEffect` returns unsubscribes when the component goes away.

```diff file=components/Guestbook.tsx lang=tsx
--- a/components/Guestbook.tsx
+++ b/components/Guestbook.tsx
@@ -15,5 +17,16 @@
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
```

`signInWithOAuth` sends the browser to DevDogs, then back to `redirectTo`. The cast is there because TypeScript only knows Supabase's built-in providers.

```diff file=components/Guestbook.tsx lang=tsx
--- a/components/Guestbook.tsx
+++ b/components/Guestbook.tsx
@@ -23,3 +36,12 @@
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
```

`signOut` ends the session, and `onAuthStateChange` updates the page.

```diff file=components/Guestbook.tsx lang=tsx
--- a/components/Guestbook.tsx
+++ b/components/Guestbook.tsx
@@ -26,2 +48,6 @@
+  function signOut() {
+    supabase.auth.signOut();
+  }
+
   return (
     <div>
```

`{session ? … : …}` in JSX picks which button to show.

```diff file=components/Guestbook.tsx lang=tsx
--- a/components/Guestbook.tsx
+++ b/components/Guestbook.tsx
@@ -26,2 +52,12 @@
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
```

The note under the buttons now says what's coming next.

```diff file=components/Guestbook.tsx lang=tsx
--- a/components/Guestbook.tsx
+++ b/components/Guestbook.tsx
@@ -28,5 +64,11 @@
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
```

[The whole `components/Guestbook.tsx` at this point](https://github.com/DevDogsUGA/Web-Workshops/blob/edc945f9755121c1d6d0ecf54be2ace9c1fc9237/components/Guestbook.tsx)

<!-- prettier-ignore-end -->
