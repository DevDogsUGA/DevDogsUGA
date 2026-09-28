---
name: Integrating an app
description: Calling the reporting RPCs from Next.js and from Flutter, and the three ways to check the integration actually works before you ship it.
order: 2
section: guides
---

# Integrating an app

There is no package to install and no registration call: an app that can report content just calls the functions. This page is the client half, for whoever is adding the affordance. The SQL half — making your table reportable in the first place — is [Moderation](/docs/platform/guides/moderation/integrating), and nothing here works until that is done. `platform` is already listed in `[api] schemas` in `supabase/config.toml`, so `.schema("platform")` needs no configuration change on either side.

## From a Next.js app

```ts
const { data: reasons } = await supabase
  .schema("platform")
  .rpc("list_report_reasons");
// reasons: { reason: ReportReason; title: string; description: string }[]

const { data, error } = await supabase.schema("platform").rpc("file_report", {
  app_slug: "forum",
  content_type: "resource",
  content_ref: resource.id,
  reason: "spam",
  description: note,
});
// data: { reportId: string; corroborated: boolean }[]
```

Argument names and result shapes both come from `supabase gen types`, so the compiler checks them against the actual functions. `supabase` is your app's ordinary client, scoped to your own schema; `.schema("platform")` is the hop. The labels come free too: `Database["platform"]["Enums"]["reportReason"]` as a union, `Constants.platform.Enums.reportReason` as a runtime array, both from `@devdogsuga/supabase`.

There is also a `<ReportDialog>` in `apps/platform/src/components/moderation/`, themed by `--dd-*` custom properties through its `theme` and `classNames` props — the full prop list is in `apps/platform/src/components/moderation/ReportDialog.tsx`. An app outside this repository copies it; nothing here is published.

```tsx
import { ReportDialog } from "~/components/moderation";

<ReportDialog
  open={open}
  onOpenChange={setOpen}
  client={supabase}
  app="forum"
  contentType="resource"
  contentRef={resource.id}
/>;
```

## From Flutter

The same calls, with no package and no generated models — Dart reads `List<Map<String, dynamic>>`:

```dart
await Supabase.instance.client
    .schema('platform')
    .rpc('file_report', params: {
      'app_slug':     'study_group_finder',
      'content_type': 'group',
      'content_ref':  group.id,
      'reason':       'spam',
      'description':  note,
    });
```

Write the reason enum by hand and check it against `pnpm devtools moderation check`; Postgres rejects an unknown label by type before `file_report` runs, so a mistake fails loudly. The Flutter team writes their own widgets — React components cannot be shared — but they implement **no protocol**.

## Testing it

`pnpm devtools` opens a menu whose Moderation group holds `check` and `grant-root`. Both act on whichever development tier the session points at — local or a hosted development project, picked the same way as every other devtools command — not only your own machine; `grant-root` also works against staging and production, with a stern confirmation before it does.

**The conformance check.** `pnpm devtools moderation check` with no argument reports the moderatable content types and why each reason exists; `pnpm devtools moderation check --app <slug>` runs `platform.conformance_check()` as a moderator persona and answers "did I declare my content correctly?" before you write any app code — this is also where the old `moderation catalog` command's output now lives. Per content type it reports whether rows are addressable, whether an author can be derived, whether `resolve_content` works against a real row, whether quarantine has a column to write to, whether clients can still write that column, and whether your policies mention it. The last two read policy text and say so — a false alarm gets looked at, a false pass does not.

**Still worth checking by hand.** Get a persona with `pnpm devtools persona member` or `pnpm devtools persona moderator` — it creates the persona against your session's development tier and prints a random password, since there's no seeded password persona to sign in as any more. Suspend it and try to write as it, then sign in as another. You are always Root on your own instance, so switching personas is the only way to encounter a permission boundary. `pnpm devtools persona --clean` removes personas you created. Reports are worked at `/console/moderation`.
