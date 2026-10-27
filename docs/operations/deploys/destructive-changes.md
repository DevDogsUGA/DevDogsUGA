---
name: Destructive changes
description: How a change that drops or rewrites data is approved on the pull request, how the deploy refuses one nobody approved, and how to do it properly.
order: 4
section: infrastructure
---

# Destructive changes

Generated SQL may only add. A change that drops or rewrites data is stopped on the pull request, and the deploy refuses it if that approval is missing or does not cover what is about to run. The person who wrote it cannot be the one who lets it through, and the person who lets it through has to read the SQL.

## What counts

`.github/scripts/sql-classify.mjs` reads the SQL and flags `DROP TABLE`, `DROP COLUMN`, `DROP SCHEMA`, type changes, renames, `TRUNCATE`, `DELETE` and `UPDATE` (so a backfill needs the label too), an upsert (`INSERT ... ON CONFLICT ... DO UPDATE` overwrites rows like `UPDATE`), `EXPLAIN ANALYZE` of a data change (it really runs), and `DO` blocks (their bodies are not inspected). The one `DO` block that passes is the idiom for creating a role that may not exist: `IF NOT EXISTS (SELECT ... FROM pg_roles ...) THEN CREATE ROLE ...` and nothing else in the block. Prefer a plain `CREATE ROLE` in a migration anyway; a role is created once, and a migration runs once. A dropped policy, view or function that is re-created in the same change is not a loss. Comments, strings and function bodies are not mistaken for statements. It reads two things:

- the SQL the **schema tree** changes compared with where the pull request started (removing a column from a file in `supabase/schemas/` makes the diff contain `DROP COLUMN`). The check builds a scratch database at the base commit and another at the head, and reads the SQL between them;
- every **hand-written migration** the pull request adds, edits or renames;
- every **seed file** under `supabase/seed/` it adds or edits (and `supabase/roles.sql`). `include_seed` runs seeds on staging and production, and seeds are insert only, so a seed that updates, deletes, drops, alters or upserts is destructive. A `DO` block in a seed is read rather than distrusted: it passes unless its body does one of those things or runs dynamic SQL (`EXECUTE`). The deploy plan classifies the seed files it is about to run the same way, so a seed cannot skip the gate by not being a migration.

## Stop one: the pull request

The `destructive-sql` check fails unless the pull request carries the **`allow-destructive`** label. The `destructive-gate` check fails if that label was applied by anyone who is not a `devops` member, which the check decides by repository permission: `maintain` (the `devops` team) or `admin` (the `admins` team). Admins are included because they can bypass the rulesets anyway; the gate keeps out everyone below them. The production deploy approvals are stricter, and name the `devops` team alone, read from the pull request's timeline so it is on record who did it. A label from anyone else is removed.

A new push to the pull request removes the label: it was applied to SQL someone read, and the SQL has changed since. The check does not trust a label it sees on a push for the same reason (removing a label with the workflow token starts no new run), so a destructive pull request stays red after each push until a `devops` member reads the new diff and applies the label again.

To let one through, as a `devops` member: open the **Checks** tab, read the `db-check` summary (the exact SQL, with the destructive statements listed), and only then add the label.

## Stop two: the deploy refuses what the pull request did not approve

The deploy asks nobody a second time. There are no `production-destructive` or `staging-destructive` approvals any more. Instead, `destructive-approval.mjs` runs in the plan jobs (so a doomed deploy never reaches the approver) and again just before each apply, and passes a destructive plan only when both of these hold:

1. **Every destructive statement in the deploy's plan appears in the plan of a merged pull request that carries `allow-destructive`, applied by a `devops` member.** The pull requests searched are those merged in the last 100 commits up to the one being deployed, not only the one that produced it. A newer commit that supersedes an older candidate (a non-destructive pull request merged while a destructive one waited for approval) still deploys the older pull request's pending statements, and the approval lives on the older pull request. A direct push (an admin bypass) has no pull request, so a destructive plan from one is refused.
2. **The statement is one that pull request showed its reviewer, in the same file.** A migration or seed statement is matched on its source file as well as its text, so an old approval of `DROP TABLE tmp` in one migration never covers the same text in a migration added later; the approving pull request must be the one that introduced that file. The schema diff has no file and is matched on the statement alone. The deploy plans against the real database; the pull request planned against its base. If the database moved in between, the deploy sees a statement the reviewer never read, and refuses. The comparison reads the pull request's `db-check` artifact: the merge queue run for its merge commit when the repository has a merge queue, otherwise the last `pull_request` run on its head commit (the plan the reviewer read when applying the label). Artifacts expire after 30 days, so a destructive change that sits merged but undeployed longer is refused with a message; re-run `database-pr` on the merged pull request's head, or revert and re-land the change.

A refused deploy fails with a message that says what to do, and changes nothing: open a pull request that carries the change, have a `devops` member read its `db-check` summary and apply the label, and merge it.

When the deploy does pass, the approval summary lists the destructive statements first, marked, with the pull request that approved them.

**The pull request check is the only gate, so it has to be required.** A merge queue is not required for this to work (a repository without one falls back to the pull request run), but it makes the compared plan the one that merged. `destructive-sql` and `destructive-gate` must be required status checks on `main` in every repository that deploys (the `main-ci` ruleset, Gate step 6). A repository without them would let a destructive change merge unlabelled; the deploy would still refuse it, but only after the merge.

## Doing it properly

Prefer two deploys over one:

1. Ship the code that no longer reads the thing, and let it run.
2. Then ship the removal. The removal is the destructive change.

Production applies migrations **before** it deploys the Workers, so a column dropped in the same commit as the code that stops reading it breaks the old code in the gap. [Dropping tables](./table-drops.md) walks through this for whole tables.

Take a copy of anything you cannot recreate first: export the rows to JSON in the repository's `archive/` folder (or a private release asset if they hold personal data), and say where in the pull request.

<details>
<summary>Why not also approve at deploy time?</summary>

It used to: a second environment asked a second `devops` member. Production now asks for one approval per deploy, and a reviewer of the plan summary sees the destructive statements first, marked, with the pull request that approved them. A second pause would have taught reviewers to click through. What the deploy-time pause caught that the label cannot is the plan that differs from the reviewed one, and the refusal above covers exactly that.

</details>
