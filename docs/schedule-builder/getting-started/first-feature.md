---
name: Your first feature
description: Replaying a real merged fix end to end, then extending it yourself.
order: 6
section: getting-started
---

# Your first feature

The best way to learn this codebase's shape is to replay a small, real, merged
change. This one is
[`fix(schedule-builder): hide courses whose sections are all cancelled`](https://github.com/DevDogsUGA/DevDogsUGA/commit/82b49bca77d22ba6a4ee927aebb8055fe78e3d6b).

## The problem

[Ingestion](/docs/schedule-builder/guides/ingestion) marks a section
`cancelled` rather than deleting it, so a course whose _only_ offering this
term got cancelled was still showing up in course search — just with nothing
enrollable behind it.

## Where it lives

Course search reads courses through two query hooks:

- `src/hooks/queries/useCoursesBySubject.ts` — courses in a subject, offered
  this term.
- `src/hooks/queries/useCoursesByInstructor.ts` — courses a given instructor
  teaches this term.

Both query Supabase directly (not through the Drizzle `db` proxy — this is
client-facing read traffic, not a server action) and both had the same gap:
neither query filtered on `offerings.cancelled`.

## The fix

Both hooks already used `offerings!inner(...)` to join in term data. The fix
adds one more `.eq()` to each query:

```typescript
const { data, error } = await supabase
  .from("courses")
  .select(
    "id, abbr, courseNumber, title, maxCreditHours, offerings!inner(academicPeriod)",
  )
  .eq("subjectId", subjectId)
  .eq("offerings.academicPeriod", academicPeriod)
  .eq("offerings.cancelled", false); // <- the fix
```

The instructor-scoped query got the equivalent `.eq("cancelled", false)`. Both
hooks were also refactored to pull the query body out into an exported
`fetchCoursesBySubject`/`fetchCoursesByInstructor` function, with the
`useQuery` hook becoming a thin wrapper — that's what makes the next part
possible.

## How it was tested

Pulling the fetch logic into a plain async function let the fix be tested
directly against Postgres, no React involved:
`src/hooks/queries/useCoursesBySubject.db-test.ts` seeds one course with an
all-cancelled offering and one with a partial-cancelled offering (one
cancelled, one active), then asserts the first is filtered out of both
functions' results and the second isn't.

That's a `*.db-test.ts` file — it needs a live database, so it runs under
`pnpm --filter schedule-builder test:db`, not the default `test`. See
[Tests](/docs/schedule-builder/guides/local-setup#tests).

## Exercise

The fix hides a course when _every_ section is cancelled. But a course with
one cancelled section and one open one still shows every section in its list
with no indication that one of them won't work — a student can pick the
cancelled one and only find out it's dead when the schedule fails to build.

Add a "Cancelled" badge to an individual section in course search (start from
`src/components/courses/CourseSearchResult.tsx`, which both `SearchBySubject.tsx`
and `SearchByInstructor.tsx` render, and thread `cancelled` through to it).
Check your work
with `pnpm --filter schedule-builder test:db` — extend the existing db-test
rather than writing a new file, so cancelled-vs-active fixtures stay in one
place.
