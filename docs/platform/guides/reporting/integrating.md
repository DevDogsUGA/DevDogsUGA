---
name: Integrating an app
description: Calling the reporting RPCs from Next.js and from Flutter, and the three ways to check the integration actually works before you ship it.
order: 2
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

There is also a `<ReportDialog>` in `apps/platform/src/components/moderation/`, themed by `--dd-*` custom properties through its `theme` and `classNames` props — the generated [Moderation components](/docs/platform/reference/components/moderation) reference has the full prop list. An app outside this repository copies it; nothing here is published.

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

Write the reason enum by hand and check it against `pnpm devtools catalog`; Postgres rejects an unknown label by type before `file_report` runs, so a mistake fails loudly. The Flutter team writes their own widgets — React components cannot be shared — but they implement **no protocol**.

## Testing it

Everything below runs on your own database. `pnpm devtools` opens a menu whose Moderation group holds `catalog`, `doctor`, `roundtrip` and `grant-root`; `pnpm sb` is the same tool under its older name. None of it can be aimed at live data, and that is structural rather than a check: these commands find their database by reading `supabase status`, which describes the Docker stack on this machine and nothing else.

**The conformance check.** `pnpm devtools doctor --app <slug>` runs `platform.conformance_check()` as the seeded moderator and answers "did I declare my content correctly?" before you write any app code. Per content type it reports whether rows are addressable, whether an author can be derived, whether `resolve_content` works against a real row, whether quarantine has a column to write to, whether clients can still write that column, and whether your policies mention it. The last two read policy text and say so — a false alarm gets looked at, a false pass does not.

**The round trip is the one that matters.** `pnpm devtools roundtrip` is the check the catalog cannot do for you. Against `platform."profile"`, it creates a throwaway member with an abusive display name and a name of record, files a report, resolves it with `quarantine` as the moderator, then asserts the remedy held — the name reset, and the member unable to set it back (`quarantineRoundTrip` in `packages/devtools/src/doctor.ts`). Fixtures are deleted afterwards either way. The equivalent against your own app is the only proof that quarantine does anything, because the effect lives in your policies rather than the platform's.

**Still worth checking by hand.** Suspend a persona and try to write as them, then sign in as another — `member@`, `author@` or `moderator@devdogs.test`, password `password`. You are always Root on your own instance, so switching personas is the only way to encounter a permission boundary. Reports are worked at `/console/moderation`.
