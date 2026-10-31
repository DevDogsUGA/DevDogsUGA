---
name: Writing a server action
description: Authorize a caller, return expected failures, and choose Draft or Command for the interaction.
order: 22
section: guides
---

# Writing a server action

Put browser-callable writes in `src/server/actions/` with a `"use server"` directive. Authorize first through `server/auth/access.ts`: call `authorize(rules.<name>)` for a capability or `authorizeSession()` for a member’s own records, and return the refusal before validation or domain work. Public actions call `publicAction()` and explain why with a `// Public:` comment.

Apply record rules in the domain module after authorization: ownership, advisor assignment and client ownership need the record. Domain code given an actor uses `callerFor(actorId)` to check that actor’s grants. It must not substitute the session’s Caller.

## Return a result

Use `ActionResult<T>` from `lib/actionResult.ts`: `{ ok: true, data?, message? }` or `{ ok: false, message, fieldErrors? }`. Use `success()` and `failure()` to construct results. Validate server input with `lib/validation`; RLS remains a backstop.

Domain code throws `ExpectedFailure` for invalid input, refusals and conflicts a user can cause. Wrap that work with `expected()` in the action to translate those failures into results. Unexpected errors still throw; do not turn bugs into generic success or failure messages. Redirecting actions remain plain forms.

## Choose the interaction

**Draft** (`ui/settings-form.tsx`) edits saved values. Save commits the pending changes; Discard restores them. The save bar guards navigation, shows server messages and puts field errors beside fields. Use it for profile fields, role cards and schedule edits.

**Command** (`ui/use-command.tsx`) performs one operation, such as award, publish or check in. `useCommand` supplies pending state, run and result; `CommandFeedback` shows errors inline and success as a toast. Successful commands refresh the route. Keep secrets and decisions inline. Compose commands for a multi-step flow instead of adding flow configuration to the hook.

Test the rule’s refusal and the domain decision, including field errors and unexpected exceptions. The action-coverage test enforces explicit authorization; it does not prove a record rule is correct.
