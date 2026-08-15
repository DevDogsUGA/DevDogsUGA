/**
 * Does my app's moderation integration actually work?
 *
 * Two checks, and the second is the one that matters.
 *
 * `conformance()` asks the database what it derived from your schema — is the
 * table addressable, can an author be attributed, does quarantine have a column
 * to write to, can a client still write that column. All of it is answerable
 * from the catalog, and `platform.conformance_check()` does the answering.
 *
 * `quarantineRoundTrip()` answers the question the catalog cannot: *does
 * quarantine do anything?* Quarantine is the only moderation outcome whose
 * effect lives in the app's own policies rather than the platform's, so it is
 * the only one that can be wired up wrong while everything appears to work —
 * the platform records the decision, sets the column, and has no way to notice
 * nobody reads it. The only proof is to file, resolve, and then look.
 *
 * It runs against `platform.profile`, where quarantine means FREEZE rather than
 * hide: the display name is reset to the member's name of record and they lose
 * the ability to change it back. A profile cannot be hidden — rosters, teams
 * and standings all render the name, and the row is own-row-only over PostgREST
 * anyway, so there is nobody to hide it from. See
 * 20260808000000_platform_profile_moderation.sql.
 *
 * Both run as seeded personas over PostgREST rather than as `postgres` over
 * SQL, because RLS is the thing under test and a superuser bypasses it.
 */
import {
  adminClient,
  personaClient,
  PERSONA_PASSWORD,
  PERSONAS,
  type Instance,
} from "./instance.js";
import type { CheckResult } from "./ui.js";

interface ConformanceType {
  contentType: string;
  /** Schema-qualified, e.g. `platform.profile`. */
  tableName: string;
  checks: CheckResult[];
}

/** Runs `platform.conformance_check()` as the seeded moderator. */
export async function conformance(
  instance: Instance,
  appSlug: string,
): Promise<ConformanceType[]> {
  const client = await personaClient(instance, PERSONAS.moderator);

  const { data, error } = await client.rpc("conformance_check", {
    app_slug: appSlug,
  });
  if (error) throw new Error(error.message);

  return (data ?? []) as ConformanceType[];
}

/** The apps that have anything to check, for the picker. */
export async function listApps(instance: Instance): Promise<string[]> {
  const { data, error } = await adminClient(instance)
    .from("apps")
    .select("slug")
    .order("slug");
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => row.slug as string);
}

export interface RoundTripStep {
  name: string;
  ok: boolean;
  detail: string;
}

/**
 * Files a report against a profile, resolves it with quarantine, and checks
 * that the freeze and the name reset both landed.
 *
 * The subject is a THROWAWAY member created for the run, not one of the seeded
 * personas, and that is not squeamishness about touching fixtures. `file_report`
 * corroborates an existing open report rather than filing a second one against
 * the same content — and the seeds ship exactly such a report against the author
 * persona's profile. Reusing it would make this function's first step silently
 * become "add a corroboration", and every assertion after it would be reading
 * the seed's decision instead of its own.
 *
 * Everything it creates, it deletes — including on the failure paths, which is
 * why the teardown is in a `finally`. A contributor running this twice should
 * get the same answer the second time.
 */
export async function quarantineRoundTrip(
  instance: Instance,
): Promise<RoundTripStep[]> {
  const steps: RoundTripStep[] = [];
  const admin = adminClient(instance);

  const email = `roundtrip-${crypto.randomUUID().slice(0, 8)}@devdogs.test`;
  const abusiveName = "BUY CHEAP FOLLOWERS NOW";

  let subjectId: string | null = null;
  let reportId: string | null = null;

  try {
    // ── Arrange: a member with an abusive display name and a name of record ──
    //
    // Through the GoTrue admin API rather than `from("users")`: the `auth`
    // schema is not exposed over PostgREST, and should not be.
    const { data: created, error: createErr } =
      await admin.auth.admin.createUser({
        email,
        password: PERSONA_PASSWORD,
        email_confirm: true,
      });
    if (createErr ?? !created.user) {
      throw new Error(
        `Could not create the subject account: ${createErr?.message}`,
      );
    }
    subjectId = created.user.id;

    const { error: profileErr } = await admin.from("profile").insert({
      userId: subjectId,
      preferredName: abusiveName,
      bio: "Created by `pnpm devtools`, and deleted again immediately.",
      // The name the reset restores. Written by the Involvement roster import
      // in production (server/actions/verification.ts); set by hand here so the
      // round-trip exercises the branch that has something to restore.
      legalFirstName: "Round",
      legalLastName: "Trip",
    });
    if (profileErr) {
      throw new Error(`Could not create a profile: ${profileErr.message}`);
    }

    steps.push({
      name: "fixture",
      ok: true,
      detail: `Created a profile named "${abusiveName}" with a name of record.`,
    });

    // ── Editable before ─────────────────────────────────────────────────────
    //
    // Establishes the baseline the freeze is measured against. Without it a
    // profile that was never editable in the first place would pass the freeze
    // check for the wrong reason.
    const subject = await personaClient(instance, email);
    await subject
      .from("profile")
      .update({ bio: "Edited." })
      .eq("userId", subjectId);

    const { data: beforeRow } = await admin
      .from("profile")
      .select("bio")
      .eq("userId", subjectId)
      .single();

    const editableBefore = beforeRow?.bio === "Edited.";
    steps.push({
      name: "editable_before",
      ok: editableBefore,
      detail: editableBefore
        ? "The member can edit their own profile before it is reported."
        : "The member could NOT edit their own profile before it was reported — the update policy is denying more than quarantine.",
    });

    // ── Act: file a report as the seeded member ─────────────────────────────
    const memberClient = await personaClient(instance, PERSONAS.member);
    // A literal, not a lookup. The vocabulary is a platform-owned enum, so
    // there is no per-app row to find first -- and if this label ever stops
    // existing, Postgres rejects the call by type rather than silently
    // reporting "no reasons configured".
    const { data: filed, error: fileErr } = await memberClient.rpc(
      "file_report",
      {
        app_slug: "platform",
        content_type: "profile",
        content_ref: subjectId,
        reason: "spam",
        description: "Filed by the devtools round-trip.",
      },
    );
    if (fileErr) throw new Error(`file_report failed: ${fileErr.message}`);

    // A one-element array, not an object: these RPCs return `setof` now, so
    // PostgREST serialises even a single result as a list.
    const [row] = (filed ?? []) as { reportId: string }[];
    if (!row) throw new Error("file_report returned no rows");
    reportId = row.reportId;
    steps.push({
      name: "file_report",
      ok: true,
      detail: `A member filed a report against the profile (${reportId}).`,
    });

    // ── Act: resolve with quarantine as the moderator ───────────────────────
    const moderator = await personaClient(instance, PERSONAS.moderator);
    const { error: resolveErr } = await moderator.rpc("resolve_report", {
      report_id: reportId,
      subject_action: "no_action",
      filer_action: "no_action",
      content_action: "quarantine",
      moderator_note: "devtools round-trip",
    });
    if (resolveErr) {
      throw new Error(`resolve_report failed: ${resolveErr.message}`);
    }
    steps.push({
      name: "resolve_report",
      ok: true,
      detail: "A moderator resolved the report with `quarantine`.",
    });

    // ── Assert: the effect actually landed ──────────────────────────────────
    const { data: after } = await admin
      .from("profile")
      .select("quarantinedBy, preferredName")
      .eq("userId", subjectId)
      .single();

    const columnSet = Boolean(after?.quarantinedBy);
    steps.push({
      name: "quarantine_column",
      ok: columnSet,
      detail: columnSet
        ? 'The resolution set "quarantinedBy" on the row.'
        : 'The resolution did NOT set "quarantinedBy" — apply_content_action did not reach this table.',
    });

    const nameReset = after?.preferredName === "Round Trip";
    steps.push({
      name: "name_reset",
      ok: nameReset,
      detail: nameReset
        ? 'The display name was reset to the name of record ("Round Trip").'
        : `The display name is still "${String(after?.preferredName)}" — the reset trigger did not fire, so the remedy is a record with no effect.`,
    });

    // ── Assert: and that the member stopped being able to undo it ───────────
    //
    // The check that matters. A denied UPDATE under RLS is not an error — it
    // simply matches no rows — so asserting on `error` here would pass just as
    // happily if the write had landed. Read the value back instead.
    await subject
      .from("profile")
      .update({ preferredName: abusiveName })
      .eq("userId", subjectId);

    const { data: frozenRow } = await admin
      .from("profile")
      .select("preferredName")
      .eq("userId", subjectId)
      .single();

    const frozen = frozenRow?.preferredName !== abusiveName;
    steps.push({
      name: "frozen_after",
      ok: frozen,
      detail: frozen
        ? "The member can no longer change their display name back."
        : 'The member CHANGED IT STRAIGHT BACK. The update policy does not filter on "quarantinedBy" — this is the check that matters.',
    });

    return steps;
  } finally {
    // Teardown runs whether or not the assertions held. Deleting the report
    // first lets the resolution cascade, which releases the FK on the profile;
    // deleting the auth user then cascades to the profile row itself.
    if (reportId) await admin.from("reports").delete().eq("id", reportId);
    if (subjectId) await admin.auth.admin.deleteUser(subjectId);
  }
}
