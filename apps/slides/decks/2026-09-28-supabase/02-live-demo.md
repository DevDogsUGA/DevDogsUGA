---
layout: section-divider
accent: rose
kicker: "02 · Live Demo"
chip: LIVE DEMO
docsPage:
  file: setup
  title: Get Set Up
  description: Clone the workshop repo, create a Supabase project, and point the app at it.
---

# Build It Live

<!-- Presenter notes: Sloan is back at the podium. Shruti's concepts map onto real code now: two laptops, one Supabase project, projected side by side. Both laptops type the code live (or paste it from the slides); if one presenter is alone, drive the web side and paste the Flutter side from the slides. Every code slide builds the step up one chunk per click, with a tip at the bottom; the Discord button posts the whole step, whichever click you're on. -->

---
layout: dual-code
accent: rose
chip: CLONE
heading: Get the Workshop Code
leftFile: terminal
rightFile: terminal
---

```bash {*}{cwd:'~'}
# Download the workshop repo
git clone https://github.com/DevDogsUGA/Web-Workshops
cd Web-Workshops
# Your own branch, starting from the Framework Intros code
git switch -c <github-username>/02-supabase origin/01-nextjs-intro
# Install dependencies
pnpm install
```

> [!NOTE]
> Skipped [Intro to Next.js](/docs/workshops/framework-intros/nextjs/setup)? That's fine: this branch already has its code, guestbook included.

::right::

```bash {*}{cwd:'~'}
# Download the workshop repo
git clone https://github.com/DevDogsUGA/Mobile-Workshops
cd Mobile-Workshops
# Your own branch, starting from the Framework Intros code
git switch -c <github-username>/02-supabase origin/01-flutter-intro
# Install dependencies
flutter pub get
```

> [!NOTE]
> Skipped [Intro to Flutter](/docs/workshops/framework-intros/flutter/setup)? That's fine: this branch already has its code, guestbook included.

<!-- Presenter notes: Everyone already has this from Setup Night; this is just the Supabase branch point. Both branches are "what you built, plus the guestbook we didn't get to." -->

---
layout: bullets-code
accent: rose
chip: SETUP
heading: Project Setup
followTrack: true
file: ~/.env.local
---

- Create a Supabase project at **supabase.com/dashboard** (it takes about a minute)
- Copy the **Project URL** and the **publishable key** from Project Settings → API
- Copy `.env.example` to `.env.local` and paste them in

> [!WARNING]
> The publishable key is safe in your app. The **secret** key never is: keep it out of `.env.local`, and out of git.

<Track mobile>

> [!IMPORTANT]
> From now on, run the app with `flutter run --dart-define-from-file=.env.local`. Flutter doesn't read `.env.local` on its own: that flag bakes its values in.

</Track>

::code::

<Track web>

<<< web:.env.example

</Track>
<Track mobile>

<<< mobile:.env.example

</Track>

<!-- Presenter notes: Create the project live on both laptops. The URL looks like https://<ref>.supabase.co and the key starts with sb_publishable_. Both apps use a file called .env.local: Next.js loads it automatically, and Flutter reads it when you run with `--dart-define-from-file=.env.local`. The publishable key is safe in the app; the secret key never is. This is the part most likely to eat time, so budget for it; a lead can drive if the room lags. Sign-in setup waits until step 2. -->

---
layout: statement
accent: rose
chip: STEP 1
docsPage:
  file: 01-read
  description: Create the messages table with row-level security, and load the guestbook from Supabase.
---

# Read the Guestbook

The guestbook from Framework Intros is already in your starter code, keeping messages in memory. Now we'll give it a real database.

<!-- Presenter notes: First step: swap the in-memory list for a real Supabase table, read-only. -->

---
layout: terminal
checkpoint: 02-supabase/01-read
accent: emerald
chip: SQL
heading: Create the Messages Table
titlebar: Dashboard → SQL Editor
---

<<< web@step-1:supabase/migrations/20260928000000_guestbook.sql {7-13|15|17-22}

<CodeTips>
<template #0>

`create table` makes the `messages` table. `default auth.uid()` fills in `user_id` with whoever is signed in.

</template>
<template #1>

Row-level security goes on: from now on, nobody can read or write a row unless a policy says so.

</template>
<template #2>

The first policy: anyone, signed in (`authenticated`) or not (`anon`), can read every message.

</template>
</CodeTips>

<!-- Presenter notes: Paste this into the dashboard's SQL editor on both laptops (shared project, so one paste covers everyone): the table, row-level security on, and one policy. Everyone can read; no sign-in required yet. This SQL ends up in a migration file at the end of the night, in the local bonus section. -->

---
layout: terminal
accent: rose
chip: SETUP
heading: Install the Supabase Client
titlebar: Terminal
followTrack: true
---

<Track web>

```bash
# Add the Supabase client
pnpm add @supabase/supabase-js
```

</Track>
<Track mobile>

```bash
# Add the Supabase client
flutter pub add supabase_flutter gotrue
```

<details>
<summary>Why add <code>gotrue</code> too?</summary>

`supabase_flutter` already depends on it, but custom OIDC providers like DevDogs need `gotrue` 2.20 or newer. Adding it directly makes sure you get one.

</details>

</Track>

<!-- Presenter notes: One package each. gotrue is pinned directly on Flutter because custom OIDC providers need gotrue 2.20 or newer. -->

---
layout: terminal
checkpoint: 02-supabase/01-read
accent: rose
chip: CODE
heading: Connect to Supabase
titlebar: Editor
followTrack: true
file:
  web: ~/lib/supabase.ts
  mobile: ~/lib/main.dart
---

<Track web>

<<< web@step-1:lib/supabase.ts {1-5|7-8|10|1-10}

<CodeTips>
<template #0>

`"use client"` marks this module for the browser: the Supabase client runs in the page.

</template>
<template #1>

`process.env.NEXT_PUBLIC_…` reads the values from `.env.local`. Next.js only hands the browser variables that start with `NEXT_PUBLIC_`.

</template>
<template #2>

`createClient` builds one Supabase client, and every component imports this same one.

</template>
</CodeTips>

</Track>
<Track mobile>

<<< mobile@step-1:lib/main.dart {build:1,2|3,4}

<CodeTips>
<template #0>

`main.dart` starts the app. Supabase has to be ready before the first screen draws.

</template>
<template #1>

`main` is now `async`, so it can `await` setup before `runApp`. `ensureInitialized` readies Flutter's plugins first.

</template>
<template #2>

`String.fromEnvironment` reads the values that `--dart-define-from-file=.env.local` baked in when you ran the app.

</template>
</CodeTips>

</Track>

<!-- Presenter notes: One client for the whole app, built from the two values in the env file. Web reads them from .env.local through process.env; Flutter bakes them in at run time with --dart-define-from-file=.env.local and initializes Supabase before runApp. -->

---
layout: dual-code
checkpoint: 02-supabase/01-read
accent: rose
chip: CODE
heading: From In-Memory to Supabase
leftFile: ~/components/Guestbook.tsx
rightFile: ~/lib/guestbook.dart
---

<<< web@step-1:components/Guestbook.tsx {build:1|2|3|4,5|6,7|8,9}

<CodeTips>
<template #0>

The guestbook from Framework Intros kept entries in memory, so they vanished on refresh. The lit lines are about to change.

</template>
<template #1>

`type Message` describes one row of the `messages` table, so TypeScript can check how we use it.

</template>
<template #2>

`useState` holds the messages this component shows; setting it re-renders the list.

</template>
<template #3>

`useEffect` runs after the first render, and the empty `[]` means just once. It asks Supabase for the rows, newest first.

</template>
<template #4>

The form goes away for now. Posting comes back in step 3, once people can sign in.

</template>
<template #5>

`key={message.id}` gives React a stable id for each row, so it can update the list efficiently.

</template>
<template #6>

Each field now comes from the database row: `author_name`, `created_at`, and `body`.

</template>
</CodeTips>

::right::

<<< mobile@step-1:lib/guestbook.dart {build:1,2,3|4,5|6|7,8|9-12|13}

<CodeTips>
<template #0>

The guestbook from Framework Intros kept entries in a list in memory, so they vanished on restart. The lit lines are about to change.

</template>
<template #1>

`Supabase.instance.client` is the client `main.dart` set up, shared by the whole app.

</template>
<template #2>

A `StatefulWidget` keeps data that changes in its `State`. `initState` runs once, when it's created: the place to start loading.

</template>
<template #3>

A `Future` with `async`/`await` waits for the database without freezing the screen. `setState` redraws with the new rows.

</template>
<template #4>

`try`/`catch` keeps one failed request from crashing the whole screen.

</template>
<template #5>

The form goes away for now, and each row arrives as a `Map`: `message['body']`.

</template>
<template #6>

`created_at` arrives as text, so `_formatTime` parses it before formatting.

</template>
</CodeTips>

<!-- Presenter notes: The in-memory list turns into the Supabase query one chunk per click; lines slide over as the new ones arrive. The form disappears for now and comes back in step 3. -->

---
layout: statement
accent: rose
chip: STEP 2
docsPage:
  file: 02-sign-in
  description: Register the app with DevDogs, add it as an OIDC provider in Supabase, and add sign-in and sign-out.
---

# Sign In with OAuth

**OIDC** (OpenID Connect) is a standard built on OAuth 2.0. It lets your app send people to another service to sign in (here, DevDogs), then tells your app who they are.

<!-- Presenter notes: No SQL this step. First register the app with DevDogs and add the provider in the Dashboard (next two slides), then the client code. -->

---
layout: numbered-list
accent: rose
chip: DEVDOGS
---

# Register Your App with DevDogs

- Go to **devdogsuga.org/settings/oauth** and create a client
- Redirect URI: your **Project URL** + `/auth/v1/callback`
  - For example, `https://abcdefghij.supabase.co/auth/v1/callback`
- Copy the **client ID** and **client secret**

> [!WARNING]
> The client secret is shown once. Keep the tab open until you've pasted it into Supabase, next.

<!-- Presenter notes: The redirect URI is the Project URL everyone already saved in .env.local, plus /auth/v1/callback. The secret is shown once, so keep the tab open until it's pasted into Supabase on the next slide. -->

---
layout: numbered-list
accent: rose
chip: DASHBOARD
---

# Add the Provider in Supabase

- Authentication → **Sign In / Providers** → Add a Custom **OIDC** Provider
- Fill it in, save, and check that it's enabled:
  - <table class="dd-config-table"><tbody><tr><th>Identifier</th><td><code>custom:devdogsuga</code></td></tr><tr><th>Name</th><td><code>DevDogs</code></td></tr><tr><th>Issuer URL</th><td><code>https://crhqsbngqmwtsplabmhj.supabase.co/auth/v1</code></td></tr><tr><th>Client ID</th><td><a href="https://devdogsuga.org/settings/oauth#credentials">Copy from your OAuth page</a></td></tr><tr><th>Client Secret</th><td><a href="https://devdogsuga.org/settings/oauth#credentials">Copy from your OAuth page</a></td></tr><tr><th>Scopes</th><td><code>openid email profile</code></td></tr></tbody></table>

<details>
<summary>Why <code>custom:</code>, and why a <code>supabase.co</code> issuer?</summary>

Supabase requires a custom provider's identifier to start with `custom:`, which is why the app signs in with `custom:devdogsuga`.

The issuer is the DevDogs Supabase project's own host, not `api.devdogsuga.org`: Supabase's OAuth server reports that host in its discovery document and ID tokens, so a provider set to the custom domain fails the issuer check. Your OAuth page shows the current issuer with a copy button.

</details>

<!-- Presenter notes: Supabase requires custom provider identifiers to start with `custom:`, which is why the app signs in with `custom:devdogsuga`. The issuer is the raw project host, not api.devdogsuga.org: Supabase's OAuth server ignores the custom domain in its discovery document and ID tokens, and a provider set to api.devdogsuga.org fails the issuer check (TASK-347). The OAuth page shows the current issuer with a copy button. `devtools oauth` does all of this in one command; it comes back in the local bonus section at the end. -->

---
layout: dual-code
checkpoint: 02-supabase/02-sign-in
accent: rose
chip: CODE
heading: Sign In / Sign Out
leftFile: ~/components/Guestbook.tsx
rightFile: ~/lib/guestbook.dart
---

<<< web@step-2:components/Guestbook.tsx {build:1,2|3,4|5|6|7|8,9}

<CodeTips>
<template #0>

Signing in only needs the client we already have: it's all under `supabase.auth`.

</template>
<template #1>

`Session` is supabase-js's type for a signed-in user; `null` means nobody's signed in.

</template>
<template #2>

`onAuthStateChange` calls back on every sign-in and sign-out. The function `useEffect` returns unsubscribes when the component goes away.

</template>
<template #3>

`signInWithOAuth` sends the browser to DevDogs, then back to `redirectTo`. The cast is there because TypeScript only knows Supabase's built-in providers.

</template>
<template #4>

`signOut` ends the session, and `onAuthStateChange` updates the page.

</template>
<template #5>

`{session ? … : …}` in JSX picks which button to show.

</template>
<template #6>

The note under the buttons now says what's coming next.

</template>
</CodeTips>

::right::

<<< mobile@step-2:lib/guestbook.dart {build:1,2|3|4|5|6|7,8}

<CodeTips>
<template #0>

Signing in only needs the client we already have: it's all under `_supabase.auth`.

</template>
<template #1>

`kIsWeb` says whether we're in a browser: come back to this page on the web, or to the app's deep link on a phone.

</template>
<template #2>

`Session?`: the `?` means it can be `null`, i.e. signed out.

</template>
<template #3>

`onAuthStateChange` is a `Stream`. `listen` runs on every sign-in and sign-out, and `setState` redraws.

</template>
<template #4>

`OAuthProvider('custom:devdogsuga')` is our custom provider, and `=>` is shorthand for a one-line function.

</template>
<template #5>

`build` copies `_session` into a local, so Dart knows it can't change halfway through.

</template>
<template #6>

`session == null ? … : …` picks which button to show.

</template>
</CodeTips>

<!-- Presenter notes: Because the contributor's own GoTrue is the relying party, sign-in mints a native session in auth.users, so auth.uid() just works with the RLS policies coming up. Flutter's OAuthProvider is a real class here (gotrue Dart >= 2.20), so no cast needed on that side; the redirect goes back to the page on web and to the app's deep link on mobile. -->

---
layout: statement
accent: rose
chip: STEP 3
docsPage:
  file: 03-post
  description: Let signed-in users post, with a policy that only lets them post as themselves.
---

# Let Signed-In Users Post

---
layout: terminal
checkpoint: 02-supabase/03-insert-naive
accent: emerald
chip: SQL
heading: Allow Signed-In Posts
titlebar: Dashboard → SQL Editor
---

<<< web@step-3:supabase/migrations/20260928000000_guestbook.sql {build}

<CodeTips>
<template #0>

The table and read policy are in place from step 1: only the new policy at the end runs.

</template>
<template #1>

Only signed-in users can insert, and `with check (auth.uid() = user_id)` means only as themselves.

</template>
</CodeTips>

<!-- Presenter notes: auth.uid() = user_id is the whole guard: Postgres itself refuses an insert claiming someone else's id. -->

---
layout: dual-code
checkpoint: 02-supabase/03-insert-naive
accent: rose
chip: CODE
heading: Posting a Message
leftFile: ~/components/Guestbook.tsx
rightFile: ~/lib/guestbook.dart
---

<<< web@step-3:components/Guestbook.tsx {build:1|2|3|4|5|6,7}

<CodeTips>
<template #0>

The form from Framework Intros comes back, now saving to the database.

</template>
<template #1>

Controlled inputs: each field's text lives in state (`useState`) and updates on every keystroke.

</template>
<template #2>

`handleSubmit` is `async`, so it can `await` the database. `preventDefault` stops the browser's own page-reloading submit.

</template>
<template #3>

The insert sends the typed name and the message; `.select().single()` hands back the saved row.

</template>
<template #4>

Put the new row at the top of the list and clear the form.

</template>
<template #5>

`{session && (…)}` shows the form only to signed-in users; `onChange` copies each keystroke into state.

</template>
<template #6>

The message box works the same way, and signed-out visitors get a hint instead of the form.

</template>
</CodeTips>

::right::

<<< mobile@step-3:lib/guestbook.dart {build:1|2|3|4|5|6,7}

<CodeTips>
<template #0>

The form from Framework Intros comes back, now saving to the database.

</template>
<template #1>

A `TextEditingController` holds what's typed in a text field.

</template>
<template #2>

`dispose` frees the controllers when the widget goes away.

</template>
<template #3>

`_submit` is `async`. It reads both fields and stops if either is empty.

</template>
<template #4>

`await` the insert, then clear the fields and reload the list.

</template>
<template #5>

`if (session != null) ...[ ]` adds the fields to the column only for signed-in users.

</template>
<template #6>

Signed-out visitors get a hint instead of the form.

</template>
</CodeTips>

<!-- Presenter notes: The name is whatever the person types, just like at Setup Night. Don't point out the problem yet; the next slide asks the room. -->

---
layout: statement
accent: rose
chip: QUESTION
---

# What's Wrong with This?

Think about it before you open the answer.

<details>
<summary>Show the answer</summary>

The **app** decides whose name goes on each message: type any name you like, and the database stores it. Nothing ties the name to the person who's signed in.

A client is just a program anyone can change: they can edit the request, or call the API directly. Row-level security checks who you are (`auth.uid() = user_id`), but nothing checks the name.

</details>

<!-- Presenter notes: Ask the room first and take a few guesses before clicking to reveal. The insert trusts a name the client sends, and a client is just a program anyone can change: type someone else's name, edit the request, or call the API directly. RLS checks who you are (auth.uid() = user_id), but nothing checks the name. This sets up the profiles fix next. -->

---
layout: statement
accent: rose
chip: STEP 4
docsPage:
  file: 04-profiles
  title: Store Names on the Server
  description: Move display names into a profiles table the server fills in, so the app stops trusting the client.
---

# How Can We Fix This?

<v-click>

Store each person's name once, on the server, when they sign up. Every message then shows the name from their account, and the app stops sending a name at all.

</v-click>

<!-- Presenter notes: Let the room guess first, then click to reveal the plan. -->

---
layout: terminal
checkpoint: 02-supabase/04-profiles
accent: emerald
chip: SQL
heading: Move Names into Profiles
titlebar: Dashboard → SQL Editor
---

<<< web@step-4:supabase/migrations/20260928000100_profiles.sql {6-11|13-19|25-30|31-34|35-44|46-48|50-61|63-70}

<CodeTips>
<template #0>

A `profiles` table: one row per person, keyed by their `auth.users` id.

</template>
<template #1>

Names are public, so everyone can read profiles. There's no write policy: only the trigger below writes here.

</template>
<template #2>

A function that runs as its owner (`security definer`), so it can write a profile the signed-in user can't.

</template>
<template #3>

It inserts one profile for each new user…

</template>
<template #4>

…named by `coalesce`: the first of `name`, `full_name`, `preferred_username`, or the start of the email.

</template>
<template #5>

The trigger runs that function every time someone signs up.

</template>
<template #6>

The backfill gives everyone who signed up before tonight a profile too.

</template>
<template #7>

Messages now point at profiles, and the `author_name` column goes away.

</template>
</CodeTips>

<details>
<summary>Why <code>security definer</code> and an empty <code>search_path</code>?</summary>

`security definer` runs the function as the table's owner, so it can write to `profiles` even though signed-in users have no write policy there. `set search_path = ''` stops it from being tricked by a same-named function or table planted earlier in a caller's search path.

</details>

<!-- Presenter notes: One paste, on one laptop (shared project); the clicks walk it. A profiles table with the same shape as messages: create, RLS on, one read-for-everyone policy. Then the trigger function: security definer + empty search_path so it can write to profiles even though the signed-in user has no write policy there, and can't be tricked by a planted function; the name comes from the first of name, full_name, preferred_username, or the email prefix. The trigger runs it on every sign-up, the backfill covers anyone who signed up before this ran, and the last change points messages at profiles and removes the author_name column. -->

---
layout: dual-code
checkpoint: 02-supabase/04-profiles
accent: rose
chip: CODE
heading: One Name per Account
leftFile: ~/components/Guestbook.tsx
rightFile: ~/lib/guestbook.dart
---

<<< web@step-4:components/Guestbook.tsx {build:3,9,10|6|7,8}

<CodeTips>
<template #0>

The lit lines are the name field and everything that feeds it: the database supplies names now.

</template>
<template #1>

No more name field: its state, its reset, and the input all go.

</template>
<template #2>

Only the message is required now.

</template>
<template #3>

The insert sends just the message. `profiles(name)` embeds the author's profile in the row that comes back.

</template>
</CodeTips>

::right::

<<< mobile@step-4:lib/guestbook.dart {build:1,2,4,7,8,9|5|6}

<CodeTips>
<template #0>

The lit lines are the name field and everything that feeds it: the database supplies names now.

</template>
<template #1>

No more name field: its controller, its `dispose` call, and the `TextField` go.

</template>
<template #2>

Only the message is required now.

</template>
<template #3>

The insert sends just the message; the server knows who's signed in.

</template>
</CodeTips>

<!-- Presenter notes: People can still change their name (most sites with user-generated content let you), but every message from one account now shows that account's one name. Nobody can post under a different name from the same account. -->

---
layout: dual-code
checkpoint: 02-supabase/04-profiles
accent: rose
chip: CODE
heading: Showing the Author's Name
leftFile: ~/components/Guestbook.tsx
rightFile: ~/lib/guestbook.dart
---

<<< web@step-4:components/Guestbook.tsx {build:[3,6,7,8,9,10]1,2|4,5|11}

<CodeTips>
<template #0>

Names live in `profiles` now, so the page fetches them along with each message.

</template>
<template #1>

`profiles` replaces `author_name` in the `Message` type: one object, or `null`.

</template>
<template #2>

`profiles(name)` embeds the author's profile through the foreign key. `overrideTypes` tells TypeScript it's one object, not a list.

</template>
<template #3>

`?.` and `??`: show the profile's name if there is one, otherwise "Unknown".

</template>
</CodeTips>

<details>
<summary>Why <code>overrideTypes</code>?</summary>

Each message has exactly one author, so `profiles(name)` comes back as one object, or `null`, never a list. Without generated database types, supabase-js guesses a list, and the names render blank.

</details>

::right::

<<< mobile@step-4:lib/guestbook.dart {build:[1,2,4,5,6,7,8,9]3|10|11}

<CodeTips>
<template #0>

Names live in `profiles` now, so the app fetches them along with each message.

</template>
<template #1>

`profiles(name)` embeds the author's profile through the foreign key, in the same query.

</template>
<template #2>

The profile arrives as a `Map` (or `null`); `?.` and `??` fall back to "Unknown".

</template>
<template #3>

The tile's title shows that name.

</template>
</CodeTips>

<!-- Presenter notes: `profiles(name)` embeds the author's profile through the new foreign key. Each message has exactly one author, so PostgREST returns a single object (or null), never a list. Without generated types supabase-js guesses an array, which is why web needs overrideTypes. Getting this wrong shows blank names on web and crashes Flutter. -->

---
layout: statement
accent: rose
chip: STEP 5
docsPage:
  file: 05-delete
  description: Let people delete only their own messages, enforced by a row-level security policy.
---

# Deleting Your Own Messages

---
layout: terminal
checkpoint: 02-supabase/05-delete
accent: emerald
chip: SQL
heading: Let Users Delete Their Own Messages
titlebar: Dashboard → SQL Editor
---

<<< web@step-5:supabase/migrations/20260928000000_guestbook.sql {build}

<CodeTips>
<template #0>

Everything above is in place already: only the new policy at the end runs.

</template>
<template #1>

Signed-in users can delete a message only when it's theirs. There's no update policy, on purpose.

</template>
</CodeTips>

<!-- Presenter notes: No update policy on purpose: this workshop only supports post-and-delete. -->

---
layout: dual-code
checkpoint: 02-supabase/05-delete
accent: rose
chip: CODE
heading: Only Your Own Delete Button
leftFile: ~/components/Guestbook.tsx
rightFile: ~/lib/guestbook.dart
---

<<< web@step-5:components/Guestbook.tsx {build:1|2}

<CodeTips>
<template #0>

Deleting takes a handler and a button, shown only on your own messages.

</template>
<template #1>

`.delete().eq("id", id)` deletes the matching row (RLS refuses anyone else's), then drops it from the list.

</template>
<template #2>

`session?.user.id === message.user_id` shows the button only on your own messages.

</template>
</CodeTips>

> [!IMPORTANT]
> Hiding the button isn't what protects other people's messages: the delete policy is. Postgres refuses to delete someone else's message, whatever the app shows.

::right::

<<< mobile@step-5:lib/guestbook.dart {build:1,2|3,4}

<CodeTips>
<template #0>

Deleting takes a handler and a button, shown only on your own messages.

</template>
<template #1>

`_delete` removes the row, then reloads the list.

</template>
<template #2>

`isOwnMessage` compares the signed-in user to the message's author; only then does the tile get a delete button.

</template>
</CodeTips>

> [!IMPORTANT]
> Hiding the button isn't what protects other people's messages: the delete policy is. Postgres refuses to delete someone else's message, whatever the app shows.

<!-- Presenter notes: The delete button only renders for your own rows client-side, but the real guard is the RLS policy: try deleting someone else's id from devtools or curl and Postgres refuses it regardless of what the UI shows. -->

---
layout: section-divider
accent: rose
chip: BONUS
kicker: Run It Locally
docsPage:
  file: run-locally
  title: Run It Locally
  description: Turn the workshop's SQL into migration files and run the whole stack on your own machine.
  shared: true
  order: 4
---

# Everything We Clicked, as Files

Everything so far ran in your Supabase project's Dashboard. This page turns the same SQL into migration files in the repo, and runs the whole stack on your machine.

> [!IMPORTANT]
> This page is optional, and needs [Docker](https://docs.docker.com/get-started/get-docker/) running.

<!-- Presenter notes: Demo only: nobody needs to follow along, and it needs Docker. Everything so far ran in the shared project's Dashboard; this turns the same SQL into migration files in the repo, which is how the monorepo works. Before starting: `supabase stop` any other local stack on this laptop (same ports, 54321-54324). -->

---
layout: terminal
accent: amber
chip: SHELL
heading: Start Supabase Locally
titlebar: terminal
---

```bash
# Start Postgres, Auth, and Studio in Docker
pnpm dlx supabase start
# Print the local API URL, Studio URL, and publishable key
pnpm dlx supabase status
```

> [!TIP]
> The first `supabase start` downloads Docker images, which takes a few minutes. If another local Supabase stack is running, stop it first with `pnpm dlx supabase stop` in its folder: they use the same ports.

<!-- Presenter notes: start boots Postgres, Auth, and Studio in Docker (the first run downloads images, so do it before the meeting). status prints the local API URL (http://127.0.0.1:54321), Studio (http://127.0.0.1:54323), and the local publishable key. Open Studio: it's the same dashboard, empty. -->

---
layout: split-reveal
accent: amber
chip: SHELL
heading: Turn the SQL into Migrations
firstLabel: Terminal
secondLabel: Editor
secondFile: ~/supabase/migrations/20260928000000_guestbook.sql
---

```bash
# Create empty, timestamped files under supabase/migrations
pnpm dlx supabase migration new guestbook
pnpm dlx supabase migration new profiles
# Paste in the SQL we ran in the Dashboard, then
# rebuild the local database from those files
pnpm dlx supabase db reset
```

::second::

<<< web:supabase/migrations/20260928000000_guestbook.sql {7-13|15|17-22|24-29|31-37}

<!-- Presenter notes: Show the commands first, then click: the editor opens beside the terminal with the first file, and the clicks recap every piece of guestbook SQL we ran tonight (table, RLS, read policy, insert policy, delete policy). Each `migration new` creates an empty, timestamped file under supabase/migrations; `db reset` rebuilds the local database from those files, so anyone who clones the repo gets the same schema. -->

---
layout: dual-code
accent: amber
chip: SHELL
heading: Turn the SQL into Migrations
trackSplit: false
leftLabel: Terminal
rightLabel: Editor
rightFile: ~/supabase/migrations/20260928000100_profiles.sql
---

```bash
# Create empty, timestamped files under supabase/migrations
pnpm dlx supabase migration new guestbook
pnpm dlx supabase migration new profiles
# Paste in the SQL we ran in the Dashboard, then
# rebuild the local database from those files
pnpm dlx supabase db reset
```

::right::

<<< web:supabase/migrations/20260928000100_profiles.sql {6-11|13-19|21-30|31-44|46-48|50-61|63-70}

<!-- Presenter notes: The second file: the profiles recap (table and policy, the sign-up trigger function, the trigger, the backfill, the switch to profiles). Then run `db reset` and show Studio with both tables. -->

---
layout: split-reveal
accent: amber
chip: SHELL
heading: Configure OAuth Sign-In
firstLabel: Editor
firstFile: ~/supabase/config.toml
secondLabel: Terminal
---

Built-in providers like Apple, GitHub or Google are config: a block in `supabase/config.toml`, with the secret in an environment variable. DevDogs is a custom provider, so it isn't in `config.toml`, and `db reset` wipes one you set up by hand.

<details>
<summary>What a built-in provider's config looks like</summary>

<<< web:supabase/config.toml {321-334}

</details>

::second::

```bash
# Register "Sign in with DevDogs" on the local stack
# (a custom provider, so it isn't in config.toml)
pnpm dlx @devdogsuga/devtools oauth
```

Then point `.env.local` at the local API URL and publishable key from `supabase status`, restart the app, and sign in against your own machine.

> [!NOTE]
> Run `devtools oauth` again after every `db reset`.

<!-- Presenter notes: Built-in providers like Apple, GitHub, or Google are just config: a block like this one in supabase/config.toml, with the secret in an env var. DevDogs is a custom OIDC provider, so it isn't in config.toml, and `db reset` wipes the one we set up by hand. Click: `devtools oauth` registers it on the local stack in one step. Then point `.env.local` at the local URL and publishable key from `supabase status`, restart the app, and sign in against your own machine. -->

---
layout: statement
accent: rose
chip: MONOREPO
---

The monorepo works exactly like this: every schema change is a migration under `supabase/migrations`.

<!-- Presenter notes: One sentence, then move on to the competition. The `02-supabase` branches (with these migrations) go public on GitHub right after tonight's workshop. -->
