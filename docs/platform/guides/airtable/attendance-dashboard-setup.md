---
name: Attendance dashboard setup
description: Deferred manual Airtable setup for attendance corrections, EL reflections, field permissions, forms, and the production automation.
order: 4
---

# Attendance dashboard setup

> **Deferred:** Complete this checklist only after the attendance, correction,
> and reflection implementation is otherwise finished and deployed. Staging and
> production share this base, so the real automation must point only at the
> production endpoint.

The schema CLI creates tables and fields, and `airtable verify` confirms their
types and stable IDs. Airtable does not expose field editing permissions or all
form security settings through that API. Those items must be completed in the
dashboard once, using this checklist.

## Before changing the dashboard

- Deploy the database changes before the application code.
- Confirm the production Worker has the narrow Airtable automation secret. Do
  not reuse `AIRTABLE_SYNC_PAT`, the cron secret, or the schema-apply token.
- Confirm the production correction endpoint and its final URL.
- Run `pnpm devtools airtable verify`. Fix fatal findings before enabling an
  automation.
- Run `pnpm devtools airtable apply` if the completed implementation added any
  fields still represented by `todo()` IDs.

## Field editing permissions

Run `pnpm devtools airtable verify` and use its **Field editing permissions**
section as the authoritative, current checklist. Restrict every field in that
list so ordinary officers cannot edit it directly and the integration identity
can. In particular:

- Restrict every platform-owned `⚙️` field in Attendance, Members, Meetings,
  Competitions, Teams, EL Reflections, and Officer Changes.
- Restrict the Attendance `Meeting` link too; Attendance is entirely a
  platform projection.
- On Officer Changes, restrict `⚙️ Form response ID`, `⚙️ Processing status`,
  `⚙️ Processed at`, `⚙️ Audit event ID`, and `⚙️ Validation error`.
- Leave Meetings and Competitions `Counts toward progress` and `EL eligible`
  editable by officers. Those are officer-authored inputs.
- Leave the global reflection-policy values in Platform Settings editable by
  officers, while restricting its `⚙️ Sync status` field.
- All officers may read EL Reflections. Officers with Audit Log access use the
  platform for full revision history.

For Officer Changes, command inputs must be writable when a form creates the
record but not directly editable afterward. Use Team-plan field permissions to
prevent grid edits while ensuring the form can still create its response. Also
restrict direct deletion of command responses as far as the dashboard allows.

## Officer Changes attribution

- Add a field named `Created by` with Airtable's **Created by** field type.
- Keep it out of the form; Airtable populates it.
- Configure the form as **Only users with base access**.
- Enable **See who submitted a response**.
- Verify a test response exposes the collaborator ID, display name, and email
  expected by the processor. Never accept a typed submitter name as authority.

After adding `Created by`, update the field registry with its stable field ID
before enabling the automation. Refresh `schema-snapshot.json` and rerun
`airtable verify`.

## Officer Changes form

Create one form over the Officer Changes table. Require `Command` and
`Correction reason`, then use conditional sections:

| Command                                  | Required inputs                      | Optional inputs                                                                                                                          |
| ---------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Add attendance                           | Meeting platform ID, Member MyID     | —                                                                                                                                        |
| Revoke attendance                        | Target platform ID (attendance UUID) | —                                                                                                                                        |
| Restore attendance                       | Target platform ID (attendance UUID) | —                                                                                                                                        |
| Grant competition participation          | Target platform ID (team UUID)       | —                                                                                                                                        |
| Revoke competition participation         | Target platform ID (team UUID)       | —                                                                                                                                        |
| Clear competition participation override | Target platform ID (team UUID)       | —                                                                                                                                        |
| Edit reflection                          | Target platform ID (reflection UUID) | Reflection content, Clear reflection content, Reflection state, New member MyID, New meeting platform ID, or New competition platform ID |

For reflection edits:

- Require at least one changed field in addition to the reason. The platform
  validates this even if Airtable cannot express the rule.
- Use `Clear reflection content` to intentionally replace the body with an
  empty draft. Do not select it while also providing replacement content; a
  plain empty content field means “leave the body unchanged.”
- `Reflection state` is an explicit Draft/Submitted selection. Blank means do
  not change it.
- Do not allow both a new meeting and new competition on one response.
- Do not put the `⚙️` processing fields on the form.

Add prefilled form links or buttons to the Attendance, Teams, and EL Reflections
officer views after all projection fields exist. Prefill the command and target
platform ID; never prefill a mutable display name as identity.

## Production automation

Create one Airtable automation:

1. Trigger it when an Officer Changes form is submitted.
2. Add a **Run a script** action.
3. Add an input variable named `recordId` and select the trigger's **Airtable
   record ID** token. Do not select the visible primary-field value.
4. Add a script secret named `automationSecret` with the same value as the
   production Worker's `AIRTABLE_AUTOMATION_SECRET`. Use Airtable's secret
   facility, not an ordinary input variable or a literal in the script.
5. Paste this script. The production endpoint is
   `https://devdogsuga.org/airtable/officer-changes`.

   ```js
   const { recordId } = input.config();
   const response = await fetch(
     "https://devdogsuga.org/airtable/officer-changes",
     {
       method: "POST",
       headers: {
         Authorization: `Bearer ${input.secret.automationSecret}`,
         "Content-Type": "application/json",
       },
       body: JSON.stringify({ recordId }),
     },
   );

   if (!response.ok) {
     throw new Error(`Platform returned HTTP ${response.status}`);
   }
   ```

   The endpoint fetches the response from Airtable itself; the script must send
   no member, attendance, team, or reflection fields.

6. Treat any non-success response as a failed action so Airtable exposes it in
   automation history. Platform receipts make a retry of the same response
   safe.
7. Turn the automation on only after the production endpoint, secret, and
   receipt reconciliation path have been verified.

Do not create an equivalent live staging automation. The base is shared, and a
staging automation could apply a real officer command twice or against the
wrong database.

## Cleanup after the replacement is verified

The schema tool deliberately does not delete fields. Once the projector/phone
rehearsal and correction round trips pass, remove these obsolete dashboard
fields manually:

- Attendance: `MyID`, `Source`, `⚙️ Sync status`, and `Workshop`.
- Meetings: `Attendance form`.
- Officer Changes: the unused `Submitted` checkbox; `Reflection state`
  replaces it.

Review reverse-link fields Airtable created automatically before deleting any
of them. A field reported by `airtable verify` as undeclared is not
automatically obsolete.

## Final rehearsal

- Submit and apply an attendance addition, revocation, and restoration.
- Grant, revoke, and clear a competition participation override.
- Edit reflection content, submission state, member, and activity association.
- Submit an invalid response and confirm it becomes Rejected with a safe error.
- Retry an applied response and confirm no second mutation or audit event.
- Edit a submitted response, retry it, and confirm the changed digest is
  rejected rather than reinterpreted.
- Simulate failed Airtable status write-back and confirm scheduled
  reconciliation repairs the projection.
- Confirm every successful change links to an append-only audit event with the
  Airtable collaborator attribution and reason.
- Confirm attendance check-in still succeeds while Airtable is unavailable.
- Run `pnpm devtools airtable verify` one final time and manually recheck every
  permission it prints.
