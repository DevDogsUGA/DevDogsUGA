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
 * quarantine hide anything?* Quarantine is the only moderation outcome whose
 * effect lives in the app's own read policies rather than the platform's, so it
 * is the only one that can be wired up wrong while everything appears to work —
 * the platform records the decision, sets the column, and has no way to notice
 * nobody reads it. The only proof is to file, resolve, and then look as someone
 * else. That is what this does.
 *
 * Both run as seeded personas over PostgREST rather than as `postgres` over
 * SQL, because RLS is the thing under test and a superuser bypasses it.
 */
import {
  adminClient,
  personaClient,
  PERSONAS,
  type Instance,
} from "./instance.js";
import type { CheckResult } from "./ui.js";

interface ConformanceType {
  contentType: string;
  /** Schema-qualified, e.g. `sandbox.posts`. */
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
 * Files a report against a sandbox post, resolves it with quarantine, and
 * checks who can still see the post.
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
  const sandbox = adminClient(instance, "sandbox");

  let postId: string | null = null;
  let reportId: string | null = null;

  try {
    // ── Arrange: a post by the author persona ────────────────────────────────
    //
    // Through the GoTrue admin API rather than `from("users")`: the `auth`
    // schema is not exposed over PostgREST, and should not be.
    const { data: users, error: usersErr } = await admin.auth.admin.listUsers();
    if (usersErr) {
      throw new Error(
        `Could not read the seeded personas: ${usersErr.message}. ` +
          "Reset the database to create them.",
      );
    }

    const authorId = users.users.find((u) => u.email === PERSONAS.author)?.id;
    if (!authorId) {
      throw new Error(
        `${PERSONAS.author} does not exist. Reset the database to seed it.`,
      );
    }

    const { data: post, error: postErr } = await sandbox
      .from("posts")
      .insert({
        authorUserId: authorId,
        title: "Round-trip fixture",
        body: "Created by `pnpm devtools`, and deleted again immediately.",
      })
      .select("id")
      .single();
    if (postErr) throw new Error(`Could not create a post: ${postErr.message}`);
    postId = post.id as string;

    steps.push({
      name: "fixture",
      ok: true,
      detail: `Created a sandbox post authored by ${PERSONAS.author}.`,
    });

    // ── Visible before ───────────────────────────────────────────────────────
    const memberSandbox = await personaClient(
      instance,
      PERSONAS.member,
      "sandbox",
    );
    const { data: before } = await memberSandbox
      .from("posts")
      .select("id")
      .eq("id", postId);

    const visibleBefore = (before ?? []).length === 1;
    steps.push({
      name: "visible_before",
      ok: visibleBefore,
      detail: visibleBefore
        ? "A member can see the post before it is reported."
        : "A member could NOT see the post before it was reported — the read policy is denying more than quarantine.",
    });

    // ── Act: file a report as the member ─────────────────────────────────────
    // Resolved in two steps rather than one embedded query: the join syntax
    // depends on PostgREST detecting the foreign key, and a plain lookup fails
    // with a message a contributor can act on.
    const { data: sandboxApp } = await admin
      .from("apps")
      .select("id")
      .eq("slug", "sandbox")
      .single();
    if (!sandboxApp) {
      throw new Error(
        "The sandbox app is not registered. Reset the database to create it.",
      );
    }

    const { data: reasons } = await admin
      .from("reportReasons")
      .select("id")
      .eq("appId", sandboxApp.id)
      .limit(1);
    if (!reasons?.[0]) {
      throw new Error(
        "No report reasons are configured for the sandbox app. Reset the database to seed them.",
      );
    }

    const memberPlatform = await personaClient(instance, PERSONAS.member);
    const { data: filed, error: fileErr } = await memberPlatform.rpc(
      "file_report",
      {
        app_slug: "sandbox",
        content_type: "posts",
        content_ref: postId,
        reason_id: reasons[0].id,
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
      detail: `A member filed a report against the post (${reportId}).`,
    });

    // ── Act: resolve with quarantine as the moderator ────────────────────────
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

    // ── Assert: the effect actually landed ───────────────────────────────────
    const { data: column } = await sandbox
      .from("posts")
      .select("quarantinedBy")
      .eq("id", postId)
      .single();

    const columnSet = Boolean(column?.quarantinedBy);
    steps.push({
      name: "quarantine_column",
      ok: columnSet,
      detail: columnSet
        ? 'The resolution set "quarantinedBy" on the row.'
        : 'The resolution did NOT set "quarantinedBy" — apply_content_action did not reach this table.',
    });

    // ── Assert: and that somebody else stopped seeing it ─────────────────────
    const { data: after } = await memberSandbox
      .from("posts")
      .select("id")
      .eq("id", postId);

    const hiddenFromMember = (after ?? []).length === 0;
    steps.push({
      name: "hidden_from_member",
      ok: hiddenFromMember,
      detail: hiddenFromMember
        ? "A member can no longer see the quarantined post."
        : 'A member can STILL see the quarantined post. The read policy does not filter on "quarantinedBy" — this is the check that matters.',
    });

    // A moderator keeps seeing it, or the queue would be unworkable.
    const moderatorSandbox = await personaClient(
      instance,
      PERSONAS.moderator,
      "sandbox",
    );
    const { data: modView } = await moderatorSandbox
      .from("posts")
      .select("id")
      .eq("id", postId);

    const visibleToModerator = (modView ?? []).length === 1;
    steps.push({
      name: "visible_to_moderator",
      ok: visibleToModerator,
      detail: visibleToModerator
        ? "A moderator can still see it, so the queue stays workable."
        : "A moderator can no longer see it either — the read policy is missing its canModerate branch.",
    });

    return steps;
  } finally {
    // Teardown runs whether or not the assertions held. Deleting the report
    // first lets the resolution cascade, which releases the FK on the post.
    if (reportId) await admin.from("reports").delete().eq("id", reportId);
    if (postId) await sandbox.from("posts").delete().eq("id", postId);
  }
}
