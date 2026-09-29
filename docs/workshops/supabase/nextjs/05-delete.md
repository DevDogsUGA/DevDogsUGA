---
name: "Deleting Your Own Messages"
description: "Let people delete only their own messages, enforced by a row-level security policy."
order: 5
---

<!-- Generated from Backstage apps/slides/decks/2026-09-28-supabase.md by `pnpm export:md`; edit the deck, not this file. -->

# Deleting Your Own Messages

<!-- prettier-ignore-start -->

<details>
<summary>Behind? Start from where the last step ended</summary>

These put your copy of the workshop code exactly where the previous step left it.

```bash cwd=~/Web-Workshops
# Get the checkpoint tags
git fetch origin --tags
# Throws away your changes to the workshop code
git switch --detach --discard-changes demo/04-profiles
```

</details>

## Let Users Delete Their Own Messages

**Dashboard → SQL Editor**:

One more policy, at the end.

Signed-in users can delete a message only when it's theirs. There's no update policy, on purpose.

```diff file=supabase/migrations/20260928000000_guestbook.sql lang=sql
--- a/supabase/migrations/20260928000000_guestbook.sql
+++ b/supabase/migrations/20260928000000_guestbook.sql
@@ -27,3 +27,11 @@
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

[The whole `supabase/migrations/20260928000000_guestbook.sql` at this point](https://github.com/DevDogsUGA/Web-Workshops/blob/9c96784c95f0f1afc8ebf730e98106a3471c3dc6/supabase/migrations/20260928000000_guestbook.sql)

## Only Your Own Delete Button

Deleting takes a handler and a button, shown only on your own messages.

`.delete().eq("id", id)` deletes the matching row (RLS refuses anyone else's), then drops it from the list.

```diff file=components/Guestbook.tsx lang=tsx
--- a/components/Guestbook.tsx
+++ b/components/Guestbook.tsx
@@ -81,6 +81,13 @@
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
```

`session?.user.id === message.user_id` shows the button only on your own messages.

```diff file=components/Guestbook.tsx lang=tsx
--- a/components/Guestbook.tsx
+++ b/components/Guestbook.tsx
@@ -132,6 +139,14 @@
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
```

[The whole `components/Guestbook.tsx` at this point](https://github.com/DevDogsUGA/Web-Workshops/blob/9c96784c95f0f1afc8ebf730e98106a3471c3dc6/components/Guestbook.tsx)

<!-- prettier-ignore-end -->
