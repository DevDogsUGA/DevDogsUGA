---
name: First contribution
description: A small, low-risk UI change to prove your setup works end to end, then opening a pull request.
order: 90
section: getting-started
---

# First contribution

A first change that touches nothing risky: edit some visible text or the
theme on the home screen in `lib/main.dart`, see it render, and open a pull
request. This exercises your whole setup — Flutter, the emulator, and the
repo's checks — before you touch anything that talks to Supabase.

## Make a UI-only change

Open `apps/study-group-finder/lib/main.dart`. `StudyGroupFinderApp` is the
whole app today: a `MaterialApp` with a Material 3 theme
(`colorSchemeSeed: const Color(0xFFBA0C2F)`) and a `Scaffold` whose body is a
centred `Text`. Change the label text, or try a different `colorSchemeSeed`
— nothing here touches Supabase, so there is nothing to break.

## Run it

```bash
pnpm dev --filter study-group-finder
```

Confirm your change shows up on the emulator (or device) Flutter picks.
Flutter's hot reload (press `r` in the terminal running `flutter run`) applies
most edits without a full restart.

## Check it

```bash
pnpm --filter study-group-finder lint    # flutter analyze
pnpm --filter study-group-finder test    # flutter test
```

If you are running the repo-wide checks instead, this app's `test` task
needs the Flutter SDK on `PATH` and fails rather than skipping without it —
`pnpm test --filter='!study-group-finder'` is the filter CI itself uses when
Flutter is out of scope for a change.

## Open a pull request

Branch from `main`, keep the commit focused
(`type(scope): subject` — see [Contributing](/docs/study-group-finder/guides/contributing)
for the full flow and what CI runs), and open a PR against `main`.
`.github/CODEOWNERS` routes `apps/study-group-finder/**` to
`@DevDogsUGA/study-group-finder` for review.

From here, [Schema change loop](/docs/study-group-finder/guides/schema-change-loop)
is the next page once your work needs a new table.
