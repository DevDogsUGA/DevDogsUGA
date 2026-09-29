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

`components/Guestbook.tsx`:

Controlled inputs: each field's text lives in state (`useState`) and updates on every keystroke.

```diff
 export default function Guestbook() {
   const [session, setSession] = useState<Session | null>(null);
   const [messages, setMessages] = useState<Message[]>([]);
+  const [name, setName] = useState("");
+  const [body, setBody] = useState("");

   // Keep track of whether anyone is signed in, and react to sign-in/out.
   useEffect(() => {
```

`handleSubmit` is `async`, so it can `await` the database. `preventDefault` stops the browser's own page-reloading submit.

```diff
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
```

The insert sends the typed name and the message; `.select().single()` hands back the saved row.

```diff
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
```

Put the new row at the top of the list and clear the form.

```diff
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
```

`{session && (…)}` shows the form only to signed-in users; `onChange` copies each keystroke into state.

```diff
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
```

The message box works the same way, and signed-out visitors get a hint instead of the form.

```diff
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

+      {!session && (
+        <p className="mt-2 text-sm text-gray-500">
+          Sign in to leave a message. Anyone can read the guestbook below.
+        </p>
+      )}
+
       <ul className="mt-6 space-y-4">
         {messages.map((message) => (
           <li key={message.id} className="rounded-lg border border-gray-200 p-4">
```

[The whole `components/Guestbook.tsx` at this point](https://github.com/DevDogsUGA/Web-Workshops/blob/1b91fdba8d5d9f3494b4d1a1ad8c2b702633abfe/components/Guestbook.tsx)

## What's Wrong with This?

The **app** decides whose name goes on each message: type any name you like, and the database stores it. Nothing ties the name to the person who's signed in.

<!-- prettier-ignore-end -->
