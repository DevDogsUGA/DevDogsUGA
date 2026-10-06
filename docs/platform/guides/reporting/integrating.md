---
name: Integrating an app
description: Calling the reporting RPCs from Next.js and from Flutter, and the three ways to check the integration actually works before you ship it.
order: 2
section: guides
---

# Integrating an app

There is no package to install and no registration call: an app that can report content just calls the functions. This page is the client half, for whoever is adding the affordance. The SQL half — making your table reportable in the first place — is [Moderation](../moderation/integrating.md), and nothing here works until that is done. `platform` is already listed in `[api] schemas` in `supabase/config.toml`, so `.schema("platform")` needs no configuration change on either side.

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

Write the reason enum by hand and check it against `platform."reportReasons"` (`pnpm devtools psql -c 'select * from platform."reportReasons" order by position'`); Postgres rejects an unknown label by type before `file_report` runs, so a mistake fails loudly. The Flutter team writes their own widgets — React components cannot be shared — but they implement **no protocol**.

## Testing it

**The content types.** Run `pnpm devtools psql -c 'select * from platform.content_types()'` to see the moderatable content types the instance knows about and how each one is quarantined. It acts on whichever tier the session points at, so run it before you write any app code to confirm your content type is declared.

**Still worth checking by hand.** Sign in with a second account and give it the role you want to test with `pnpm devtools roles grant <email> <role>`. Suspend it and try to write as it, then sign in as another. Take your own account out of the picture with `roles grant` and `roles revoke` as well: with President you hold every permission, so a second account is the only way to encounter a permission boundary. Reports are worked at `/console/moderation`.
