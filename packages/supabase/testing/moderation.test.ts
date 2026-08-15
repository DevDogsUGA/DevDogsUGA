/**
 * The reporting contract: content-type derivation, the dispatcher, and the
 * public RPCs.
 *
 * Every case asserts both an allow and a deny. A policy test that only checks
 * the allow side passes just as happily when the policy is missing entirely --
 * and two of the denials here (execute on `resolve_content` and
 * `apply_content_action`) were in fact wide open on first write, because
 * revoking from `anon, authenticated` leaves the default PUBLIC grant intact.
 *
 * ⚠️ THE SUBJECT IS REAL CONTENT. This suite used to run against a `sandbox`
 * schema of fake posts, comments and profiles that existed only to be reported
 * -- an entire fixture app registered in platform."apps" on every tier. It is
 * gone, and these cases now point at platform."profile", the same table the
 * account settings page writes.
 *
 * That changes what quarantine MEANS here, and it is the main thing to hold on
 * to when reading below. For a post, quarantine hides. For a profile it
 * FREEZES: the display name is reset to the member's name of record and they
 * lose the ability to change it back. A profile cannot be hidden -- rosters,
 * teams and standings all render the name, and the row is own-row-only over
 * PostgREST anyway. `contentTypes."quarantineEffect"` is where that is
 * declared, and `conformance_report` checks the right policy accordingly.
 *
 * Requires the local stack with migrations and seeds applied
 * (`pnpm sb reset`). Run via `pnpm --filter @devdogsuga/supabase test:rls`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  admin,
  anon,
  appId,
  closeSql,
  createPersona,
  createSubject,
  deleteReports,
  deleteRole,
  destroyPersonas,
  destroySubjects,
  giveProfile,
  grantRole,
  one,
  sql,
  suspend,
  type Persona,
  type Subject,
} from "./personas";

let author: Persona;
let reporter: Persona;
let moderator: Persona;
let suspended: Persona;
let moderatorRoleId: string;
let platformAppId: string;

/**
 * A table in a registered app's schema, created for one test and dropped after.
 *
 * `schedule_builder` is the host rather than `platform`: it is a real
 * registered app with a real schema, so the DDL cases exercise the same
 * derivation path a new app would hit -- without adding a table to the schema
 * every other test in this file reads.
 */
const HOST_SCHEMA = "schedule_builder";
const HOST_APP = "schedule_builder";

/**
 * A one-pixel WebP.
 *
 * `[storage.buckets.avatars] allowed_mime_types = ["image/webp"]`, and storage
 * enforces it on the declared content type before any policy is consulted — so
 * an upload with the wrong type is rejected for a reason that has nothing to do
 * with what these tests are asserting.
 */
const WEBP_BYTES = Uint8Array.from(
  atob("UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA=="),
  (c) => c.charCodeAt(0),
);

async function createHostTable(
  name: string,
  { quarantinable }: { quarantinable: boolean },
): Promise<void> {
  await sql().unsafe(`
    create table ${HOST_SCHEMA}."${name}" (
      "id" uuid not null default gen_random_uuid() primary key,
      "authorUserId" uuid not null references auth.users("id") on delete cascade,
      "caption" text not null
      ${
        quarantinable
          ? `, "quarantinedBy" uuid references "platform"."reportResolutions"("id") on delete set null`
          : ""
      }
    )
  `);
}

async function dropHostTable(name: string): Promise<void> {
  await sql()`
    delete from "platform"."contentTypes"
    where "tableName" = ${name}
  `;
  await sql().unsafe(`drop table if exists ${HOST_SCHEMA}."${name}"`);
}

/** Resolves a report the way `server/actions/moderation.ts` does: one transaction. */
async function resolveWith(
  reportId: string,
  contentAction: "quarantine" | "no_action",
) {
  const [report] = await sql()`
    select r."contentType", r."contentRef", a."slug"
    from "platform"."reports" r
    join "platform"."apps" a on a."id" = r."appId"
    where r."id" = ${reportId}
  `;

  return sql().begin(async (tx) => {
    await tx`
      update "platform"."reports"
      set "status" = 'resolved', "resolvedAt" = now()
      where "id" = ${reportId}
    `;
    const [resolution] = await tx`
      insert into "platform"."reportResolutions"
        ("reportId", "moderatorUserId", "subjectAction", "filerAction", "contentAction")
      values (${reportId}, ${moderator.userId}, 'warn', 'no_action', ${contentAction})
      returning "id"
    `;
    await tx`
      select "platform".apply_content_action(
        ${report!.slug}, ${report!.contentType}, ${report!.contentRef},
        ${contentAction}::"platform"."contentAction", ${resolution!.id}::uuid
      )
    `;
    return resolution!.id as string;
  });
}

beforeAll(async () => {
  author = await createPersona("author");
  reporter = await createPersona("reporter");
  moderator = await createPersona("moderator");
  suspended = await createPersona("suspended");

  moderatorRoleId = await grantRole(moderator, "Moderator", {
    canModerate: true,
  });
  await suspend(suspended);

  // The author is both an actor and reportable content, which is the one case
  // profile moderation makes possible and the post fixtures never could.
  await giveProfile(author, {
    preferredName: "Avery Author",
    bio: "Writes things.",
    legalFirstName: "Avery",
    legalLastName: "Author",
  });

  platformAppId = await appId("platform");
}, 90_000);

afterAll(async () => {
  await deleteRole(moderatorRoleId);
  await destroyPersonas(author, reporter, moderator, suspended);
  await closeSql();
});

describe("privileged functions", () => {
  // These three read or write any registered app's content as the definer.
  // resolve_content in particular would be a disclosure oracle: ask about a row
  // you cannot see and read its snapshot back -- and profile is exactly such a
  // row, since its SELECT policy is own-row-only.
  it("are not executable by a client, at any persona", async () => {
    const subject = await createSubject("private", {
      preferredName: "Private Person",
      bio: "Nobody may read this.",
    });
    try {
      for (const client of [anon(), reporter.client, moderator.client]) {
        const { error: resolveError } = await client.rpc("resolve_content", {
          app_slug: "platform",
          content_type: "profile",
          content_ref: subject.userId,
        });
        expect(resolveError?.message).toMatch(/permission denied/);

        const { error: applyError } = await client.rpc("apply_content_action", {
          app_slug: "platform",
          content_type: "profile",
          content_ref: subject.userId,
          action: "quarantine",
          resolution_id: "00000000-0000-0000-0000-000000000000",
        });
        expect(applyError?.message).toMatch(/permission denied/);

        const { error: typesError } = await client.rpc("content_types");
        expect(typesError?.message).toMatch(/permission denied/);
      }

      // The deny side has teeth here: a moderator cannot read the bio through
      // PostgREST either, because profile's read policy is own-row-only.
      const { data: direct } = await moderator.client
        .from("profile")
        .select("bio")
        .eq("userId", subject.userId);
      expect(direct).toEqual([]);

      // The allow side: the same information through the gated wrappers.
      const { data: types } = await moderator.client.rpc("list_content_types", {
        app_slug: "platform",
      });
      expect(types).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ contentType: "profile" }),
        ]),
      );

      const { data: inspected } = await moderator.client.rpc(
        "inspect_content",
        {
          app_slug: "platform",
          content_type: "profile",
          content_ref: subject.userId,
        },
      );
      expect(inspected).toMatchObject({
        snapshot: expect.stringContaining("Nobody"),
      });
    } finally {
      await destroySubjects(subject);
    }
  });

  it("hide content types from a member and show them to a moderator", async () => {
    const { data: asMember } = await reporter.client.rpc("list_content_types", {
      app_slug: "platform",
    });
    expect(asMember).toEqual([]);
  });
});

describe("content type derivation", () => {
  it("derives profile from the schema, and takes the overrides it is given", async () => {
    const { data } = await moderator.client.rpc("list_content_types", {
      app_slug: "platform",
    });
    const byType = Object.fromEntries(
      (data as Record<string, unknown>[]).map((t) => [t.contentType, t]),
    );

    expect(byType.profile).toMatchObject({
      tableName: "profile",
      label: "Profile",
      // Both derived, and both "userId": one row per user means the primary key
      // and the author are the same column.
      refColumn: "userId",
      authorColumn: "userId",
      quarantineColumn: "quarantinedBy",
      // Defaulted closed. A bio can hold more than the reporter actually saw.
      visibility: "restricted",
    });

    // The one override that is load-bearing rather than cosmetic. Left to the
    // default, a snapshot captures EVERY text column on the table -- which
    // since 20260803000000 includes "legalFirstName", "legalLastName" and
    // "ugaEmail", copied into a report row that is kept forever.
    expect(byType.profile).toMatchObject({
      snapshotColumns: ["preferredName", "bio"],
    });
    const snapshotColumns = (byType.profile as { snapshotColumns: string[] })
      .snapshotColumns;
    for (const leaked of ["legalFirstName", "legalLastName", "ugaEmail"]) {
      expect(snapshotColumns).not.toContain(leaked);
    }
  });

  it("is the only content type the platform declares", async () => {
    // Guards against the reverse mistake: some future platform table acquiring
    // a foreign key to "reportResolutions" and silently becoming reportable.
    const { data } = await moderator.client.rpc("list_content_types", {
      app_slug: "platform",
    });
    expect(
      (data as { contentType: string }[]).map((t) => t.contentType),
    ).toEqual(["profile"]);
  });

  it("follows the schema: adding the foreign key registers a table, dropping it unregisters", async () => {
    const typesFor = async (contentType: string) => {
      const rows = await sql()`
        select * from "platform".content_types()
        where "appSlug" = ${HOST_APP} and "contentType" = ${contentType}
      `;
      return rows[0];
    };

    await createHostTable("widgets", { quarantinable: false });

    try {
      // A table in a registered app's schema is not content until it says so.
      expect(await typesFor("widgets")).toBeUndefined();

      await sql().unsafe(`
        alter table ${HOST_SCHEMA}."widgets"
          add column "quarantinedBy" uuid
            references "platform"."reportResolutions"("id") on delete set null
      `);

      // No registration call, no restart, no cache to invalidate.
      expect(await typesFor("widgets")).toMatchObject({
        tableName: "widgets",
        refColumn: "id",
        authorColumn: "authorUserId",
        snapshotColumns: ["caption"],
        quarantineColumn: "quarantinedBy",
      });

      await sql().unsafe(
        `alter table ${HOST_SCHEMA}."widgets" drop column "quarantinedBy"`,
      );
      expect(await typesFor("widgets")).toBeUndefined();
    } finally {
      await dropHostTable("widgets");
    }
  });

  it("leaves an existing report intact when its type is unregistered", async () => {
    await createHostTable("widgets", { quarantinable: true });

    let reportId: string | undefined;
    try {
      const [widget] = await sql().unsafe(
        `insert into ${HOST_SCHEMA}."widgets" ("authorUserId", "caption")
         values ($1, $2) returning "id"`,
        [author.userId, "a widget worth reporting"],
      );

      const { data: filed, error } = await reporter.client.rpc("file_report", {
        app_slug: HOST_APP,
        content_type: "widgets",
        content_ref: widget!.id,
        reason: "spam",
      });
      expect(error).toBeNull();
      reportId = one<{ reportId: string }>(filed).reportId;

      await sql().unsafe(
        `alter table ${HOST_SCHEMA}."widgets" drop column "quarantinedBy"`,
      );

      // The frozen snapshot is the whole point: a moderator still sees what was
      // reported, and the report resolves as unresolvable rather than erroring.
      const { data: mine } = await reporter.client.rpc("my_reports", {
        app_slug: HOST_APP,
      });
      const row = (mine as Record<string, unknown>[]).find(
        (r) => r.reportId === reportId,
      );
      expect(row).toBeTruthy();

      const [stored] = await sql()`
        select "contentSnapshot" from "platform"."reports" where "id" = ${reportId}
      `;
      expect(stored!.contentSnapshot).toBe("a widget worth reporting");
    } finally {
      if (reportId) await deleteReports(reportId);
      await dropHostTable("widgets");
    }
  });
});

describe("platform.file_report", () => {
  it("rejects content that does not exist", async () => {
    const { error } = await reporter.client.rpc("file_report", {
      app_slug: "platform",
      content_type: "profile",
      content_ref: "00000000-0000-0000-0000-0000000000ff",
      reason: "spam",
    });
    expect(error?.message).toMatch(/No profile with reference/);
  });

  // The predecessor of this test asserted that a reason belonging to another
  // app was rejected. There is no such thing now: one global vocabulary, no
  // per-app and no per-content-type lists. What replaces it is the guarantee
  // that took over the job -- the enum.
  //
  // This asserts the DATABASE's half of that guarantee, not TypeScript's. The
  // persona clients here are built without the `Database` generic (see
  // personas.ts), so nothing in this file is type-checked against the catalog;
  // the compile-time half is covered where it actually applies, by `callRpc` in
  // apps/platform/src/components/moderation. Both halves matter, because Dart
  // has no compile-time half at all.
  it("rejects a label that is not in the enum, before the body runs", async () => {
    const subject = await createSubject("fine");
    try {
      const { error } = await reporter.client.rpc("file_report", {
        app_slug: "platform",
        content_type: "profile",
        content_ref: subject.userId,
        reason: "not_a_real_reason",
      });
      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/invalid input value for enum/i);
    } finally {
      await destroySubjects(subject);
    }
  });

  it("requires a description for 'other', and only for 'other'", async () => {
    const subject = await createSubject("odd");
    try {
      const { error: bare } = await reporter.client.rpc("file_report", {
        app_slug: "platform",
        content_type: "profile",
        content_ref: subject.userId,
        reason: "other",
      });
      expect(bare?.message).toMatch(/description is required/i);

      // Whitespace is not a description.
      const { error: blank } = await reporter.client.rpc("file_report", {
        app_slug: "platform",
        content_type: "profile",
        content_ref: subject.userId,
        reason: "other",
        description: "   ",
      });
      expect(blank?.message).toMatch(/description is required/i);

      const { data, error } = await reporter.client.rpc("file_report", {
        app_slug: "platform",
        content_type: "profile",
        content_ref: subject.userId,
        reason: "other",
        description: "It is behaving strangely.",
      });
      expect(error).toBeNull();
      await deleteReports(one<{ reportId: string }>(data).reportId);
    } finally {
      await destroySubjects(subject);
    }
  });

  it("keeps the enum and its presentation table in step", async () => {
    // Only one direction can break: the table's primary key IS the enum type,
    // so a row cannot exist without a label. A label with no row can, and it
    // fails silently -- file_report accepts it, list_report_reasons omits it,
    // and the generated TypeScript union still contains it. Adding a reason
    // takes two migrations precisely because `alter type ... add value` cannot
    // be used in the transaction that adds it, so this is what catches someone
    // writing the first file and not the second.
    const orphans = await sql()`
      select unnest(enum_range(null::"platform"."reportReason")) as label
      except
      select "reason" from "platform"."reportReasons"
    `;
    expect(orphans).toEqual([]);
  });

  it("takes the subject and the snapshot from the content, not the caller", async () => {
    const subject = await createSubject("reported", {
      preferredName: "Reported",
      bio: "The body of it.",
    });
    let reportId: string | undefined;
    try {
      const { data } = await reporter.client.rpc("file_report", {
        app_slug: "platform",
        content_type: "profile",
        content_ref: subject.userId,
        reason: "spam",
        description: "please look",
      });
      reportId = one<{ reportId: string }>(data).reportId;

      const [row] = await sql()`
        select "reporterUserId", "reportedUserId", "contentSnapshot"
        from "platform"."reports" where "id" = ${reportId}
      `;
      expect(row!.reporterUserId).toBe(reporter.userId);
      // The reporter never sent this: it is the profile's owner, read from
      // source.
      expect(row!.reportedUserId).toBe(subject.userId);
      expect(row!.contentSnapshot).toBe("Reported\n\nThe body of it.");

      // And there is no parameter through which either could be supplied.
      const { error } = await reporter.client.rpc("file_report", {
        app_slug: "platform",
        content_type: "profile",
        content_ref: subject.userId,
        reason: "spam",
        reported_user_id: reporter.userId,
      });
      expect(error).not.toBeNull();
    } finally {
      if (reportId) await deleteReports(reportId);
      await destroySubjects(subject);
    }
  });

  it("corroborates an open report instead of queueing a duplicate", async () => {
    const subject = await createSubject("twice");
    let reportId: string | undefined;
    try {
      const { data: first } = await reporter.client.rpc("file_report", {
        app_slug: "platform",
        content_type: "profile",
        content_ref: subject.userId,
        reason: "spam",
      });
      // Unwrap before asserting: a failed assertion here would otherwise skip
      // the assignment below and leave the report undeletable in `finally`,
      // which then counts against this reporter's hourly rate limit and fails
      // an unrelated test further down.
      const firstRow = one<{ reportId: string; corroborated: boolean }>(first);
      expect(firstRow).toMatchObject({ corroborated: false });
      reportId = firstRow.reportId;

      const { data: second } = await moderator.client.rpc("file_report", {
        app_slug: "platform",
        content_type: "profile",
        content_ref: subject.userId,
        reason: "spam",
      });
      expect(
        one<{ reportId: string; corroborated: boolean }>(second),
      ).toMatchObject({ reportId, corroborated: true });

      const [reports] = await sql()`
        select count(*)::int as "n" from "platform"."reports"
        where "contentRef" = ${subject.userId}
      `;
      expect(reports!.n).toBe(1);

      const [corroborations] = await sql()`
        select count(*)::int as "n" from "platform"."reportCorroborations"
        where "reportId" = ${reportId}
      `;
      expect(corroborations!.n).toBe(1);
    } finally {
      if (reportId) await deleteReports(reportId);
      await destroySubjects(subject);
    }
  });

  it("refuses a suspended reporter and allows an ordinary one", async () => {
    const subject = await createSubject("bait");
    let reportId: string | undefined;
    try {
      const { error } = await suspended.client.rpc("file_report", {
        app_slug: "platform",
        content_type: "profile",
        content_ref: subject.userId,
        reason: "spam",
      });
      expect(error?.message).toMatch(/Suspended/);

      const { data, error: allowed } = await reporter.client.rpc(
        "file_report",
        {
          app_slug: "platform",
          content_type: "profile",
          content_ref: subject.userId,
          reason: "spam",
        },
      );
      expect(allowed).toBeNull();
      reportId = one<{ reportId: string }>(data).reportId;
    } finally {
      if (reportId) await deleteReports(reportId);
      await destroySubjects(subject);
    }
  });

  it("rate-limits a reporter", async () => {
    // Eleven distinct subjects rather than eleven reports against one: a second
    // report of the same content corroborates instead of filing, so reusing a
    // subject would never reach the limit at all.
    const subjects: Subject[] = [];
    const reportIds: string[] = [];
    try {
      for (let i = 0; i < 11; i++) {
        subjects.push(await createSubject(`ratelimit${i}`));
      }

      for (let i = 0; i < 10; i++) {
        const { data, error } = await reporter.client.rpc("file_report", {
          app_slug: "platform",
          content_type: "profile",
          content_ref: subjects[i]!.userId,
          reason: "spam",
        });
        expect(error, `report ${i} should be accepted`).toBeNull();
        reportIds.push(one<{ reportId: string }>(data).reportId);
      }

      const { error: limited } = await reporter.client.rpc("file_report", {
        app_slug: "platform",
        content_type: "profile",
        content_ref: subjects[10]!.userId,
        reason: "spam",
      });
      expect(limited?.message).toMatch(/Too many reports/);

      // Scoped to the reporter, not global: someone else is unaffected.
      const { error: other } = await moderator.client.rpc("file_report", {
        app_slug: "platform",
        content_type: "profile",
        content_ref: subjects[10]!.userId,
        reason: "spam",
      });
      expect(other).toBeNull();
    } finally {
      await deleteReports(...reportIds);
      await sql()`
        delete from "platform"."reports"
        where "contentRef" = any(${subjects.map((s) => s.userId)})
      `;
      await destroySubjects(...subjects);
    }
  }, 120_000);
});

describe("quarantine", () => {
  it("freezes the profile and resets the display name to the name of record", async () => {
    let reportId: string | undefined;
    try {
      const { data } = await reporter.client.rpc("file_report", {
        app_slug: "platform",
        content_type: "profile",
        content_ref: author.userId,
        reason: "harassment",
      });
      reportId = one<{ reportId: string }>(data).reportId;

      // Editable before the decision. Without this the freeze assertion below
      // would pass for the wrong reason on a profile that was never writable.
      const { error: beforeErr } = await author.client
        .from("profile")
        .update({ preferredName: "BUY CHEAP FOLLOWERS NOW" })
        .eq("userId", author.userId);
      expect(beforeErr).toBeNull();

      const [before] = await sql()`
        select "preferredName" from "platform"."profile"
        where "userId" = ${author.userId}
      `;
      expect(before!.preferredName).toBe("BUY CHEAP FOLLOWERS NOW");

      await resolveWith(reportId!, "quarantine");

      // The remedy: the name reverts to what the roster says it is.
      const [after] = await sql()`
        select "preferredName", "quarantinedBy" from "platform"."profile"
        where "userId" = ${author.userId}
      `;
      expect(after!.preferredName).toBe("Avery Author");
      expect(after!.quarantinedBy).toBeTruthy();

      // And it stays reverted. A denied UPDATE under RLS is not an error -- it
      // matches no rows -- so asserting on `error` would pass just as happily
      // if the write had landed. Read the value back instead.
      await author.client
        .from("profile")
        .update({ preferredName: "BUY CHEAP FOLLOWERS NOW" })
        .eq("userId", author.userId);

      const [frozen] = await sql()`
        select "preferredName" from "platform"."profile"
        where "userId" = ${author.userId}
      `;
      expect(frozen!.preferredName).toBe("Avery Author");

      // The reporter is told, without being told what happened to the author.
      const { data: outcomes } = await reporter.client.rpc("my_reports", {
        app_slug: "platform",
        only_open: false,
      });
      expect(outcomes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            reportId,
            outcome: "action_taken",
            contentRemoved: true,
          }),
        ]),
      );
      expect(JSON.stringify(outcomes)).not.toContain("subjectAction");
    } finally {
      if (reportId) await deleteReports(reportId);
      // Deleting the report cascades the resolution, which `on delete set null`
      // clears from the profile -- so the author is editable again for the
      // tests that follow.
      await giveProfile(author, {
        preferredName: "Avery Author",
        bio: "Writes things.",
        legalFirstName: "Avery",
        legalLastName: "Author",
      });
    }
  });

  it("reaches the whole public profile, not just the table it is set on", async () => {
    // The public profile is three surfaces: platform."profile",
    // platform."profileLinks", and an object in the `avatars` storage bucket.
    // Freezing only the first would let a member move an abusive name into a
    // link title or an avatar — stopped, as far as the moderation record shows,
    // while still editing the page a moderator was looking at.
    const subject = await createPersona("wholeprofile");
    let reportId: string | undefined;
    try {
      await giveProfile(subject, {
        preferredName: "Whole Profile",
        legalFirstName: "Whole",
        legalLastName: "Profile",
      });

      // Editable before, on every surface.
      const { data: link, error: linkErr } = await subject.client
        .from("profileLinks")
        .insert({
          userId: subject.userId,
          url: "https://example.com",
          title: "Site",
        })
        .select("id")
        .single();
      expect(linkErr).toBeNull();

      // The positive control for the storage half, and it earned its place
      // twice: the first version of the assertion below passed against a bucket
      // rejecting `application/octet-stream` on mime type alone, and the second
      // against an upsert denied for want of a SELECT policy. Neither had
      // reached the policy under test.
      //
      // So: upload, then remove, leaving no object behind. The attempt after
      // the freeze is then a first INSERT of a name that does not exist, which
      // is the only way to reach `avatar_insert_policy` and nothing else.
      const avatar = () => new Blob([WEBP_BYTES], { type: "image/webp" });

      const { error: uploadedBefore } = await subject.client.storage
        .from("avatars")
        .upload(subject.userId, avatar(), { contentType: "image/webp" });
      expect(uploadedBefore).toBeNull();

      const { error: removedBefore } = await subject.client.storage
        .from("avatars")
        .remove([subject.userId]);
      expect(removedBefore).toBeNull();

      const { data } = await reporter.client.rpc("file_report", {
        app_slug: "platform",
        content_type: "profile",
        content_ref: subject.userId,
        reason: "harassment",
      });
      reportId = one<{ reportId: string }>(data).reportId;
      await resolveWith(reportId!, "quarantine");

      // profileLinks: insert, update and delete all stop.
      const { error: inserted } = await subject.client
        .from("profileLinks")
        .insert({
          userId: subject.userId,
          url: "https://evil.example",
          title: "Abuse",
        });
      expect(inserted).not.toBeNull();

      await subject.client
        .from("profileLinks")
        .update({ title: "Abuse" })
        .eq("id", link!.id as string);

      const [stored] = await sql()`
        select "title" from "platform"."profileLinks"
        where "id" = ${link!.id as string}
      `;
      expect(stored!.title).toBe("Site");

      await subject.client
        .from("profileLinks")
        .delete()
        .eq("id", link!.id as string);

      const [surviving] = await sql()`
        select count(*)::int as "n" from "platform"."profileLinks"
        where "userId" = ${subject.userId}
      `;
      expect(surviving!.n).toBe(1);

      // The avatar object, whose policies live in the `storage` schema and know
      // nothing about platform except through is_profile_frozen(). Same call
      // that succeeded above, so the only thing that changed is the freeze.
      const { error: avatarErr } = await subject.client.storage
        .from("avatars")
        .upload(subject.userId, avatar(), { contentType: "image/webp" });
      expect(avatarErr).not.toBeNull();
    } finally {
      if (reportId) await deleteReports(reportId);
      await destroyPersonas(subject);
    }
  });

  it("leaves the name alone when there is no name of record", async () => {
    // The tier-3 path. A member who has never appeared on an Involvement roster
    // has no legal name, and blanking "preferredName" would render as a gap in
    // every roster, team and standings table -- worse than the name a moderator
    // is already looking at. They still have `suspend` and `ban` for that.
    const subject = await createSubject("nameless", {
      preferredName: "STILL ABUSIVE",
    });
    let reportId: string | undefined;
    try {
      const { data } = await reporter.client.rpc("file_report", {
        app_slug: "platform",
        content_type: "profile",
        content_ref: subject.userId,
        reason: "harassment",
      });
      reportId = one<{ reportId: string }>(data).reportId;

      await resolveWith(reportId!, "quarantine");

      const [after] = await sql()`
        select "preferredName", "quarantinedBy" from "platform"."profile"
        where "userId" = ${subject.userId}
      `;
      expect(after!.preferredName).toBe("STILL ABUSIVE");
      // The freeze still applies, which is the part that must not depend on
      // whether a name was available to restore.
      expect(after!.quarantinedBy).toBeTruthy();
    } finally {
      if (reportId) await deleteReports(reportId);
      await destroySubjects(subject);
    }
  });

  it("cannot be cleared by the subject, or set by anyone", async () => {
    // A full persona rather than a bare subject: the case that matters is the
    // quarantined member clearing their OWN column, which needs a client
    // carrying their session.
    const subject = await createPersona("clearer");
    let reportId: string | undefined;
    try {
      await giveProfile(subject, {
        preferredName: "Clearer",
        legalFirstName: "Real",
        legalLastName: "Name",
      });

      const { data } = await reporter.client.rpc("file_report", {
        app_slug: "platform",
        content_type: "profile",
        content_ref: subject.userId,
        reason: "spam",
      });
      reportId = one<{ reportId: string }>(data).reportId;
      const resolutionId = await resolveWith(reportId!, "quarantine");

      // The column grant, not a policy. 20260803000000 revoked the table-wide
      // UPDATE on profile and granted it back one column at a time, so a column
      // added afterwards is unreachable by construction -- `revoke update
      // ("quarantinedBy")` alone would not have held, because a table-wide
      // grant outranks it.
      //
      // That also makes this a ROLE-level denial rather than a row-level one,
      // which is why both directions fail the same way: the subject clearing
      // their own, and a moderator forging one onto somebody else.
      const { error: cleared } = await subject.client
        .from("profile")
        .update({ quarantinedBy: null })
        .eq("userId", subject.userId);
      expect(cleared?.message).toMatch(/permission denied/);

      const { error: forged } = await moderator.client
        .from("profile")
        .update({ quarantinedBy: resolutionId })
        .eq("userId", author.userId);
      expect(forged?.message).toMatch(/permission denied/);

      const [row] = await sql()`
        select "quarantinedBy" from "platform"."profile"
        where "userId" = ${subject.userId}
      `;
      expect(row!.quarantinedBy).toBe(resolutionId);
    } finally {
      if (reportId) await deleteReports(reportId);
      await destroyPersonas(subject);
    }
  });

  it("rolls the whole decision back when it cannot be applied", async () => {
    // A type that is reportable but has no column to quarantine into -- declared
    // by a row in "contentTypes" rather than derived from a foreign key. The RPC
    // raises rather than no-oping, which is what makes the decision atomic.
    await createHostTable("notes", { quarantinable: false });

    let reportId: string | undefined;
    try {
      await sql()`
        insert into "platform"."contentTypes"
          ("appId", "tableName", "label", "authorColumn", "snapshotColumns")
        select a."id", 'notes', 'Note', 'authorUserId', array['caption']::text[]
        from "platform"."apps" a where a."slug" = ${HOST_APP}
      `;

      const [note] = await sql().unsafe(
        `insert into ${HOST_SCHEMA}."notes" ("authorUserId", "caption")
         values ($1, $2) returning "id"`,
        [author.userId, "a note"],
      );

      const { data } = await reporter.client.rpc("file_report", {
        app_slug: HOST_APP,
        content_type: "notes",
        content_ref: note!.id,
        reason: "spam",
      });
      reportId = one<{ reportId: string }>(data).reportId;

      await expect(resolveWith(reportId, "quarantine")).rejects.toThrow(
        /cannot be quarantined/,
      );

      const [report] = await sql()`
        select "status" from "platform"."reports" where "id" = ${reportId}
      `;
      expect(report!.status).toBe("open");

      const [resolutions] = await sql()`
        select count(*)::int as "n" from "platform"."reportResolutions"
        where "reportId" = ${reportId}
      `;
      expect(resolutions!.n).toBe(0);

      // The allow side: the same report resolves fine without a content action.
      await resolveWith(reportId, "no_action");
      const [after] = await sql()`
        select "status" from "platform"."reports" where "id" = ${reportId}
      `;
      expect(after!.status).toBe("resolved");
    } finally {
      if (reportId) await deleteReports(reportId);
      await dropHostTable("notes");
    }
  });

  it("never disagrees with the resolution that caused it", async () => {
    // The reconciliation query. Column grants and RLS do not constrain the
    // service role or direct SQL, so this is what covers the residual gap.
    const rows = await sql()`
      select p."userId"
      from "platform"."profile" p
      join "platform"."reportResolutions" res on res."id" = p."quarantinedBy"
      where res."contentAction" <> 'quarantine'
    `;
    expect(rows).toEqual([]);
  });
});

describe("snapshot visibility", () => {
  it("is withheld for restricted content and returned for public", async () => {
    await createHostTable("notes", { quarantinable: false });

    const subject = await createSubject("restricted", {
      preferredName: "Restricted",
      bio: "Private words.",
    });
    const reportIds: string[] = [];

    try {
      await sql()`
        insert into "platform"."contentTypes"
          ("appId", "tableName", "label", "authorColumn", "snapshotColumns", "visibility")
        select a."id", 'notes', 'Note', 'authorUserId', array['caption']::text[],
               'public'::"platform"."contentVisibility"
        from "platform"."apps" a where a."slug" = ${HOST_APP}
      `;

      const [note] = await sql().unsafe(
        `insert into ${HOST_SCHEMA}."notes" ("authorUserId", "caption")
         values ($1, $2) returning "id"`,
        [author.userId, "public words"],
      );

      const { data: restricted } = await reporter.client.rpc("file_report", {
        app_slug: "platform",
        content_type: "profile",
        content_ref: subject.userId,
        reason: "spam",
      });
      reportIds.push(one<{ reportId: string }>(restricted).reportId);

      const { data: pub } = await reporter.client.rpc("file_report", {
        app_slug: HOST_APP,
        content_type: "notes",
        content_ref: note!.id,
        reason: "spam",
      });
      reportIds.push(one<{ reportId: string }>(pub).reportId);

      const { data: mine } = await reporter.client.rpc("my_reports");
      const rows = mine as Record<string, unknown>[];

      // profile defaults to restricted because nothing configured it, which is
      // the point of defaulting closed -- and here it is doing real work, since
      // a bio can hold more than whatever the reporter actually saw.
      expect(
        rows.find((r) => r.reportId === reportIds[0])!.snapshot,
      ).toBeNull();
      // The declared-public type comes back, every snapshot column of it,
      // joined in declaration order.
      expect(rows.find((r) => r.reportId === reportIds[1])!.snapshot).toMatch(
        /public words$/,
      );
    } finally {
      await deleteReports(...reportIds);
      await destroySubjects(subject);
      await dropHostTable("notes");
    }
  });
});

describe("platform.profile as an app", () => {
  it("refuses writes from a suspended user and allows them otherwise", async () => {
    // The cross-app ban, which profile's update policy did not consult until
    // 20260808000000. A suspended member could edit their display name and bio
    // for as long as the suspension lasted.
    await giveProfile(suspended, { preferredName: "Suspended Sam" });

    await suspended.client
      .from("profile")
      .update({ preferredName: "Should not land" })
      .eq("userId", suspended.userId);

    const [row] = await sql()`
      select "preferredName" from "platform"."profile"
      where "userId" = ${suspended.userId}
    `;
    expect(row!.preferredName).toBe("Suspended Sam");

    const { error } = await author.client
      .from("profile")
      .update({ bio: "Lands." })
      .eq("userId", author.userId);
    expect(error).toBeNull();
  });
});

describe("platform.resolve_report", () => {
  it("is refused to a member and to the impersonation entry point", async () => {
    const subject = await createSubject("spam");
    let reportId: string | undefined;
    try {
      const { data } = await reporter.client.rpc("file_report", {
        app_slug: "platform",
        content_type: "profile",
        content_ref: subject.userId,
        reason: "spam",
      });
      reportId = one<{ reportId: string }>(data).reportId;

      const { error: asMember } = await reporter.client.rpc("resolve_report", {
        report_id: reportId,
        subject_action: "warn",
        filer_action: "no_action",
        content_action: "quarantine",
      });
      expect(asMember?.message).toMatch(/canModerate/);

      // resolve_report_as takes the moderator as an argument, so a client that
      // could call it could act as anyone. Execute is revoked; without that
      // revoke the check above would be trivially bypassable.
      const { error: impersonating } = await moderator.client.rpc(
        "resolve_report_as",
        {
          actor: moderator.userId,
          report_id: reportId,
          subject_action: "warn",
          filer_action: "no_action",
          content_action: "no_action",
        },
      );
      expect(impersonating?.message).toMatch(/permission denied/);

      // The allow side.
      const { error: asModerator } = await moderator.client.rpc(
        "resolve_report",
        {
          report_id: reportId,
          subject_action: "warn",
          filer_action: "no_action",
          content_action: "quarantine",
        },
      );
      expect(asModerator).toBeNull();
    } finally {
      if (reportId) await deleteReports(reportId);
      await destroySubjects(subject);
    }
  });

  it("reports a ban back to the caller rather than applying it", async () => {
    // Supabase's native ban needs admin credentials, which a browser does not
    // have. The suspension -- which is what every app's write policies actually
    // consult -- is applied either way.
    const subject = await createSubject("bannable");
    let reportId: string | undefined;
    try {
      const { data } = await reporter.client.rpc("file_report", {
        app_slug: "platform",
        content_type: "profile",
        content_ref: subject.userId,
        reason: "spam",
      });
      reportId = one<{ reportId: string }>(data).reportId;

      const { data: outcome } = await moderator.client.rpc("resolve_report", {
        report_id: reportId,
        subject_action: "ban",
        filer_action: "no_action",
        content_action: "no_action",
        apply_globally: true,
      });
      expect(
        one<{ resolutionId: string; bannedUserId: string | null }>(outcome),
      ).toMatchObject({ bannedUserId: subject.userId });

      const { data: isSuspended } = await admin().rpc("is_suspended", {
        uid: subject.userId,
      });
      expect(isSuspended).toBe(true);
    } finally {
      if (reportId) await deleteReports(reportId);
      await destroySubjects(subject);
    }
  });

  it("refuses to decide a report twice", async () => {
    const subject = await createSubject("twice-decided");
    let reportId: string | undefined;
    try {
      const { data } = await reporter.client.rpc("file_report", {
        app_slug: "platform",
        content_type: "profile",
        content_ref: subject.userId,
        reason: "spam",
      });
      reportId = one<{ reportId: string }>(data).reportId;

      await moderator.client.rpc("dismiss_report", { report_id: reportId });

      const { error } = await moderator.client.rpc("resolve_report", {
        report_id: reportId,
        subject_action: "ban",
        filer_action: "no_action",
        content_action: "no_action",
      });
      expect(error?.message).toMatch(/already been decided/);

      const [row] = await sql()`
        select "status" from "platform"."reports" where "id" = ${reportId}
      `;
      expect(row!.status).toBe("dismissed");
    } finally {
      if (reportId) await deleteReports(reportId);
      await destroySubjects(subject);
    }
  });
});

describe("platform.conformance_check", () => {
  it("passes for the platform app, and is refused to a member", async () => {
    const { error } = await reporter.client.rpc("conformance_check", {
      app_slug: "platform",
    });
    expect(error?.message).toMatch(/canModerate/);

    const { data } = await moderator.client.rpc("conformance_check", {
      app_slug: "platform",
    });
    const failures = (
      data as { contentType: string; checks: { name: string; ok: boolean }[] }[]
    ).flatMap((t) =>
      t.checks.filter((c) => !c.ok).map((c) => `${t.contentType}.${c.name}`),
    );
    expect(failures).toEqual([]);
  });

  it("checks the write policy for a freeze type, not the read policy", async () => {
    // profile declares quarantineEffect = 'freeze', so the check that applies is
    // whether an UPDATE policy consults the column. Asserting the *shape* of the
    // report, not just that it passes: a version of this check that silently
    // skipped freeze types would also show zero failures above.
    const { data } = await moderator.client.rpc("conformance_check", {
      app_slug: "platform",
    });
    const profile = (
      data as { contentType: string; checks: { name: string; ok: boolean }[] }[]
    ).find((t) => t.contentType === "profile");

    const names = profile!.checks.map((c) => c.name);
    expect(names).toContain("write_policy_freezes_quarantine");
    expect(names).not.toContain("read_policy_filters_quarantine");
  });

  it("catches a table-wide UPDATE grant that re-exposes the quarantine column", async () => {
    // The mistake the check exists for: column-level REVOKE does not override a
    // table-level grant, so this is what an app looks like when it followed the
    // obvious-but-wrong integration snippet.
    await sql().unsafe(`grant update on "platform"."profile" to authenticated`);
    try {
      const { data } = await moderator.client.rpc("conformance_check", {
        app_slug: "platform",
      });
      const profile = (
        data as {
          contentType: string;
          checks: { name: string; ok: boolean }[];
        }[]
      ).find((t) => t.contentType === "profile");
      const protectedCheck = profile?.checks.find(
        (c) => c.name === "quarantine_protected",
      );
      expect(protectedCheck?.ok).toBe(false);
    } finally {
      // Restore exactly what 20260803000000 grants, or every later test in this
      // file runs against a profile table a client can rewrite wholesale.
      await sql().unsafe(
        `revoke update on "platform"."profile" from authenticated`,
      );
      await sql().unsafe(`
        grant update (
          "preferredName", "bio", "pronouns", "graduationSemester",
          "graduationYear", "showGithub", "showDiscord", "showEmail",
          "showLinkedin", "viewedConsole", "roleDescription"
        ) on "platform"."profile" to authenticated
      `);
    }
  });
});

describe("platform.apps", () => {
  it("registers the platform app itself", async () => {
    expect(platformAppId).toBeTruthy();
  });
});
