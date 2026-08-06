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
 * Requires the local stack with migrations and seeds applied
 * (`pnpm sb reset`). Run via `pnpm --filter @devdogsuga/sb test:rls`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  admin,
  anon,
  appId,
  closeSql,
  createPersona,
  createPost,
  deletePosts,
  deleteReports,
  deleteRole,
  destroyPersonas,
  grantRole,
  reasonId,
  sql,
  suspend,
  withEnvironment,
  type Persona,
} from "./personas";

let author: Persona;
let reporter: Persona;
let moderator: Persona;
let suspended: Persona;
let feedbackManager: Persona;
let moderatorRoleId: string;
let feedbackRoleId: string;
let spamReason: string;
let sandboxAppId: string;

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
  feedbackManager = await createPersona("feedbackmgr");

  moderatorRoleId = await grantRole(moderator, "Moderator", {
    canModerate: true,
  });
  feedbackRoleId = await grantRole(feedbackManager, "FeedbackManager", {
    canManageFeedback: true,
  });
  await suspend(suspended);

  spamReason = await reasonId("sandbox", "Spam");
  sandboxAppId = await appId("sandbox");
}, 90_000);

afterAll(async () => {
  await deleteRole(moderatorRoleId);
  await deleteRole(feedbackRoleId);
  await destroyPersonas(
    author,
    reporter,
    moderator,
    suspended,
    feedbackManager,
  );
  await closeSql();
});

describe("privileged functions", () => {
  // These three read or write any registered app's content as the definer.
  // resolve_content in particular would be a disclosure oracle: ask about a row
  // you cannot see and read its snapshot back.
  it("are not executable by a client, at any persona", async () => {
    const post = await createPost(author, "Private", "Nobody may read this.");
    try {
      for (const client of [anon(), reporter.client, moderator.client]) {
        const { error: resolveError } = await client.rpc("resolve_content", {
          app_slug: "sandbox",
          content_type: "posts",
          content_ref: post,
        });
        expect(resolveError?.message).toMatch(/permission denied/);

        const { error: applyError } = await client.rpc("apply_content_action", {
          app_slug: "sandbox",
          content_type: "posts",
          content_ref: post,
          action: "quarantine",
          resolution_id: "00000000-0000-0000-0000-000000000000",
        });
        expect(applyError?.message).toMatch(/permission denied/);

        const { error: typesError } = await client.rpc("content_types");
        expect(typesError?.message).toMatch(/permission denied/);
      }

      // The allow side: a moderator reaches the same information through the
      // gated wrappers.
      const { data: types } = await moderator.client.rpc("list_content_types", {
        app_slug: "sandbox",
      });
      expect(types).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ contentType: "posts" }),
        ]),
      );

      const { data: inspected } = await moderator.client.rpc(
        "inspect_content",
        { app_slug: "sandbox", content_type: "posts", content_ref: post },
      );
      expect(inspected).toMatchObject({
        snapshot: expect.stringContaining("Nobody"),
      });
    } finally {
      await deletePosts(post);
    }
  });

  it("hide content types from a member and show them to a moderator", async () => {
    const { data: asMember } = await reporter.client.rpc("list_content_types", {
      app_slug: "sandbox",
    });
    expect(asMember).toEqual([]);
  });
});

describe("content type derivation", () => {
  it("reports the three shapes the sandbox declares", async () => {
    const { data } = await moderator.client.rpc("list_content_types", {
      app_slug: "sandbox",
    });
    const byType = Object.fromEntries(
      (data as Record<string, unknown>[]).map((t) => [t.contentType, t]),
    );

    // Derived purely from the foreign key: no row in platform."contentTypes".
    expect(byType.posts).toMatchObject({
      tableName: "posts",
      label: "Posts",
      refColumn: "id",
      authorColumn: "authorUserId",
      snapshotColumns: ["title", "body"],
      visibility: "restricted",
      quarantineColumn: "quarantinedBy",
    });
    expect(byType.comments).toMatchObject({
      quarantineColumn: "quarantinedBy",
    });

    // Declared, not derived: reportable, but with no column to quarantine into.
    expect(byType.profile).toMatchObject({
      tableName: "profiles",
      authorColumn: "userId",
      visibility: "public",
      quarantineColumn: null,
    });
  });

  it("follows the schema: adding the foreign key registers a table, dropping it unregisters", async () => {
    const typesFor = async (contentType: string) => {
      const rows = await sql()`
        select * from "platform".content_types()
        where "appSlug" = 'sandbox' and "contentType" = ${contentType}
      `;
      return rows[0];
    };

    await sql().unsafe(`
      create table sandbox."widgets" (
        "id" uuid not null default gen_random_uuid() primary key,
        "authorUserId" uuid not null references auth.users("id") on delete cascade,
        "caption" text not null
      )
    `);

    try {
      // A table in a registered app's schema is not content until it says so.
      expect(await typesFor("widgets")).toBeUndefined();

      await sql().unsafe(`
        alter table sandbox."widgets"
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
        `alter table sandbox."widgets" drop column "quarantinedBy"`,
      );
      expect(await typesFor("widgets")).toBeUndefined();
    } finally {
      await sql().unsafe(`drop table if exists sandbox."widgets"`);
    }
  });

  it("leaves an existing report intact when its type is unregistered", async () => {
    await sql().unsafe(`
      create table sandbox."widgets" (
        "id" uuid not null default gen_random_uuid() primary key,
        "authorUserId" uuid not null references auth.users("id") on delete cascade,
        "caption" text not null,
        "quarantinedBy" uuid references "platform"."reportResolutions"("id") on delete set null
      )
    `);

    let reportId: string | undefined;
    try {
      const [widget] = await sql()`
        insert into sandbox."widgets" ("authorUserId", "caption")
        values (${author.userId}, 'a widget worth reporting')
        returning "id"
      `;

      const { data: filed, error } = await reporter.client.rpc("file_report", {
        app_slug: "sandbox",
        content_type: "widgets",
        content_ref: widget!.id,
        reason_id: spamReason,
      });
      expect(error).toBeNull();
      reportId = (filed as { reportId: string }).reportId;

      await sql().unsafe(
        `alter table sandbox."widgets" drop column "quarantinedBy"`,
      );

      // The frozen snapshot is the whole point: a moderator still sees what was
      // reported, and the report resolves as unresolvable rather than erroring.
      const { data: mine } = await reporter.client.rpc("my_reports", {
        app_slug: "sandbox",
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
      await sql().unsafe(`drop table if exists sandbox."widgets"`);
    }
  });
});

describe("platform.file_report", () => {
  it("rejects content that does not exist", async () => {
    const { error } = await reporter.client.rpc("file_report", {
      app_slug: "sandbox",
      content_type: "posts",
      content_ref: "00000000-0000-0000-0000-0000000000ff",
      reason_id: spamReason,
    });
    expect(error?.message).toMatch(/No posts with reference/);
  });

  it("rejects a reason belonging to a different app", async () => {
    const otherReason = await reasonId("platform", "Spam");
    const post = await createPost(author, "Fine", "Fine content.");
    try {
      const { error } = await reporter.client.rpc("file_report", {
        app_slug: "sandbox",
        content_type: "posts",
        content_ref: post,
        reason_id: otherReason,
      });
      expect(error?.message).toMatch(/does not belong to app/);
    } finally {
      await deletePosts(post);
    }
  });

  it("takes the subject and the snapshot from the content, not the caller", async () => {
    const post = await createPost(author, "Reported", "The body of it.");
    let reportId: string | undefined;
    try {
      const { data } = await reporter.client.rpc("file_report", {
        app_slug: "sandbox",
        content_type: "posts",
        content_ref: post,
        reason_id: spamReason,
        description: "please look",
      });
      reportId = (data as { reportId: string }).reportId;

      const [row] = await sql()`
        select "reporterUserId", "reportedUserId", "contentSnapshot"
        from "platform"."reports" where "id" = ${reportId}
      `;
      expect(row!.reporterUserId).toBe(reporter.userId);
      // The reporter never sent this: it is the post's author, read from source.
      expect(row!.reportedUserId).toBe(author.userId);
      expect(row!.contentSnapshot).toBe("Reported\n\nThe body of it.");

      // And there is no parameter through which either could be supplied.
      const { error } = await reporter.client.rpc("file_report", {
        app_slug: "sandbox",
        content_type: "posts",
        content_ref: post,
        reason_id: spamReason,
        reported_user_id: reporter.userId,
      });
      expect(error).not.toBeNull();
    } finally {
      if (reportId) await deleteReports(reportId);
      await deletePosts(post);
    }
  });

  it("corroborates an open report instead of queueing a duplicate", async () => {
    const post = await createPost(author, "Twice reported", "Body.");
    let reportId: string | undefined;
    try {
      const { data: first } = await reporter.client.rpc("file_report", {
        app_slug: "sandbox",
        content_type: "posts",
        content_ref: post,
        reason_id: spamReason,
      });
      expect(first).toMatchObject({ corroborated: false });
      reportId = (first as { reportId: string }).reportId;

      const { data: second } = await moderator.client.rpc("file_report", {
        app_slug: "sandbox",
        content_type: "posts",
        content_ref: post,
        reason_id: spamReason,
      });
      expect(second).toMatchObject({ reportId, corroborated: true });

      const [reports] = await sql()`
        select count(*)::int as "n" from "platform"."reports"
        where "contentRef" = ${post}
      `;
      expect(reports!.n).toBe(1);

      const [corroborations] = await sql()`
        select count(*)::int as "n" from "platform"."reportCorroborations"
        where "reportId" = ${reportId}
      `;
      expect(corroborations!.n).toBe(1);
    } finally {
      if (reportId) await deleteReports(reportId);
      await deletePosts(post);
    }
  });

  it("refuses a suspended reporter and allows an ordinary one", async () => {
    const post = await createPost(author, "Bait", "Body.");
    let reportId: string | undefined;
    try {
      const { error } = await suspended.client.rpc("file_report", {
        app_slug: "sandbox",
        content_type: "posts",
        content_ref: post,
        reason_id: spamReason,
      });
      expect(error?.message).toMatch(/Suspended/);

      const { data, error: allowed } = await reporter.client.rpc(
        "file_report",
        {
          app_slug: "sandbox",
          content_type: "posts",
          content_ref: post,
          reason_id: spamReason,
        },
      );
      expect(allowed).toBeNull();
      reportId = (data as { reportId: string }).reportId;
    } finally {
      if (reportId) await deleteReports(reportId);
      await deletePosts(post);
    }
  });

  it("rate-limits a reporter", async () => {
    const posts: string[] = [];
    const reportIds: string[] = [];
    try {
      for (let i = 0; i < 11; i++) {
        posts.push(await createPost(author, `Post ${i}`, "Body."));
      }

      for (let i = 0; i < 10; i++) {
        const { data, error } = await reporter.client.rpc("file_report", {
          app_slug: "sandbox",
          content_type: "posts",
          content_ref: posts[i]!,
          reason_id: spamReason,
        });
        expect(error, `report ${i} should be accepted`).toBeNull();
        reportIds.push((data as { reportId: string }).reportId);
      }

      const { error: limited } = await reporter.client.rpc("file_report", {
        app_slug: "sandbox",
        content_type: "posts",
        content_ref: posts[10]!,
        reason_id: spamReason,
      });
      expect(limited?.message).toMatch(/Too many reports/);

      // Scoped to the reporter, not global: someone else is unaffected.
      const { error: other } = await moderator.client.rpc("file_report", {
        app_slug: "sandbox",
        content_type: "posts",
        content_ref: posts[10]!,
        reason_id: spamReason,
      });
      expect(other).toBeNull();
    } finally {
      await deleteReports(...reportIds);
      await sql()`delete from "platform"."reports" where "contentRef" = any(${posts})`;
      await deletePosts(...posts);
    }
  }, 60_000);
});

describe("quarantine", () => {
  it("hides content from everyone but its author and a moderator", async () => {
    const post = await createPost(author, "Spam", "Buy things.");
    let reportId: string | undefined;
    try {
      const { data } = await reporter.client.rpc("file_report", {
        app_slug: "sandbox",
        content_type: "posts",
        content_ref: post,
        reason_id: spamReason,
      });
      reportId = (data as { reportId: string }).reportId;

      // Visible to all three before the decision.
      for (const p of [reporter, author, moderator]) {
        const { data: rows } = await p.client
          .schema("sandbox")
          .from("posts")
          .select("id")
          .eq("id", post);
        expect(rows).toHaveLength(1);
      }

      await resolveWith(reportId!, "quarantine");

      const { data: hidden } = await reporter.client
        .schema("sandbox")
        .from("posts")
        .select("id")
        .eq("id", post);
      expect(hidden).toEqual([]);

      const { data: anonView } = await anon()
        .schema("sandbox")
        .from("posts")
        .select("id")
        .eq("id", post);
      expect(anonView).toEqual([]);

      for (const p of [author, moderator]) {
        const { data: rows } = await p.client
          .schema("sandbox")
          .from("posts")
          .select("id")
          .eq("id", post);
        expect(rows).toHaveLength(1);
      }

      // And the reporter is told, without being told what happened to the author.
      const { data: outcomes } = await reporter.client.rpc("report_outcomes", {
        app_slug: "sandbox",
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
      await deletePosts(post);
    }
  });

  it("cannot be cleared by the author, or set by anyone", async () => {
    const post = await createPost(author, "Spam", "Buy things.");
    let reportId: string | undefined;
    try {
      const { data } = await reporter.client.rpc("file_report", {
        app_slug: "sandbox",
        content_type: "posts",
        content_ref: post,
        reason_id: spamReason,
      });
      reportId = (data as { reportId: string }).reportId;
      const resolutionId = await resolveWith(reportId!, "quarantine");

      // The column grant, not a policy: `revoke update ("quarantinedBy")` alone
      // would not have held, because a table-wide UPDATE grant outranks it.
      const { error: cleared } = await author.client
        .schema("sandbox")
        .from("posts")
        .update({ quarantinedBy: null })
        .eq("id", post);
      expect(cleared?.message).toMatch(/permission denied/);

      const { error: forged } = await moderator.client
        .schema("sandbox")
        .from("posts")
        .update({ quarantinedBy: resolutionId })
        .eq("id", post);
      expect(forged?.message).toMatch(/permission denied/);

      const [row] = await sql()`
        select "quarantinedBy" from sandbox."posts" where "id" = ${post}
      `;
      expect(row!.quarantinedBy).toBe(resolutionId);

      // The author may still edit a post that is *not* quarantined, so the
      // denial above is about this column and this state, not about UPDATE.
      const other = await createPost(author, "Fine", "Fine.");
      const { error: allowed } = await author.client
        .schema("sandbox")
        .from("posts")
        .update({ title: "Fine, edited" })
        .eq("id", other);
      expect(allowed).toBeNull();
      await deletePosts(other);
    } finally {
      if (reportId) await deleteReports(reportId);
      await deletePosts(post);
    }
  });

  it("rolls the whole decision back when it cannot be applied", async () => {
    const [profile] = await sql()`
      insert into sandbox."profiles" ("userId", "handle", "bio")
      values (${author.userId}, ${`h${Date.now()}`}, 'a bio')
      on conflict ("userId") do update set "bio" = 'a bio'
      returning "id"
    `;

    const { data } = await reporter.client.rpc("file_report", {
      app_slug: "sandbox",
      content_type: "profile",
      content_ref: profile!.id,
      reason_id: spamReason,
    });
    const reportId = (data as { reportId: string }).reportId;

    try {
      // A profile is reportable but has no column to quarantine into. The RPC
      // raises rather than no-oping, which is what makes the decision atomic.
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
      await deleteReports(reportId);
      await sql()`delete from sandbox."profiles" where "id" = ${profile!.id}`;
    }
  });

  it("never disagrees with the resolution that caused it", async () => {
    // The reconciliation query. Column grants and RLS do not constrain the
    // service role or direct SQL, so this is what covers the residual gap.
    const rows = await sql()`
      select p."id"
      from sandbox."posts" p
      join "platform"."reportResolutions" res on res."id" = p."quarantinedBy"
      where res."contentAction" <> 'quarantine'
      union all
      select c."id"
      from sandbox."comments" c
      join "platform"."reportResolutions" res on res."id" = c."quarantinedBy"
      where res."contentAction" <> 'quarantine'
    `;
    expect(rows).toEqual([]);
  });
});

describe("snapshot visibility", () => {
  it("is withheld for restricted content and returned for public", async () => {
    const post = await createPost(author, "Restricted", "Private words.");
    const [profile] = await sql()`
      insert into sandbox."profiles" ("userId", "handle", "bio")
      values (${author.userId}, ${`h${Date.now()}`}, 'public words')
      on conflict ("userId") do update set "bio" = 'public words'
      returning "id"
    `;
    const reportIds: string[] = [];

    try {
      for (const [type, ref] of [
        ["posts", post],
        ["profile", profile!.id as string],
      ] as const) {
        const { data } = await reporter.client.rpc("file_report", {
          app_slug: "sandbox",
          content_type: type,
          content_ref: ref,
          reason_id: spamReason,
        });
        reportIds.push((data as { reportId: string }).reportId);
      }

      const { data: mine } = await reporter.client.rpc("my_reports", {
        app_slug: "sandbox",
      });
      const rows = mine as Record<string, unknown>[];

      const postRow = rows.find((r) => r.reportId === reportIds[0]);
      const profileRow = rows.find((r) => r.reportId === reportIds[1]);

      // 'posts' defaults to restricted because nothing configured it, which is
      // the point of defaulting closed.
      expect(postRow!.snapshot).toBeNull();
      // 'profile' is declared public, so the reporter sees what they reported --
      // every snapshot column of it, joined in declaration order.
      expect(profileRow!.snapshot).toMatch(/public words$/);
    } finally {
      await deleteReports(...reportIds);
      await deletePosts(post);
      await sql()`delete from sandbox."profiles" where "id" = ${profile!.id}`;
    }
  });
});

describe("platform.submit_feedback", () => {
  it("accepts feedback and rejects a topic from another app", async () => {
    const { data: topics } = await reporter.client.rpc("list_feedback_topics", {
      app_slug: "sandbox",
    });
    const topicId = (topics as { id: string }[])[0]!.id;

    const { data, error } = await reporter.client.rpc("submit_feedback", {
      app_slug: "sandbox",
      feedback_type: "bug_report",
      title: "Posts load slowly",
      description: "Takes a few seconds.",
      topic_id: topicId,
    });
    expect(error).toBeNull();
    const feedbackId = (data as { feedbackId: string }).feedbackId;

    try {
      const { error: wrongApp } = await reporter.client.rpc("submit_feedback", {
        app_slug: "platform",
        feedback_type: "bug_report",
        title: "Mismatched",
        description: "Topic belongs to sandbox.",
        topic_id: topicId,
      });
      expect(wrongApp?.message).toMatch(/does not belong to app/);

      // The submitter reads their own back; another member does not.
      const { data: own } = await reporter.client
        .from("feedback")
        .select("id")
        .eq("id", feedbackId);
      expect(own).toHaveLength(1);

      const { data: other } = await author.client
        .from("feedback")
        .select("id")
        .eq("id", feedbackId);
      expect(other).toEqual([]);

      // A canManageFeedback holder reads everyone's.
      const { data: managed } = await feedbackManager.client
        .from("feedback")
        .select("id")
        .eq("id", feedbackId);
      expect(managed).toHaveLength(1);
    } finally {
      await admin().from("feedback").delete().eq("id", feedbackId);
    }
  });

  it("refuses a suspended submitter", async () => {
    const { error } = await suspended.client.rpc("submit_feedback", {
      app_slug: "sandbox",
      feedback_type: "bug_report",
      title: "Anything",
      description: "Anything at all.",
    });
    expect(error?.message).toMatch(/Suspended/);
  });
});

describe("the sandbox app", () => {
  it("refuses writes from a suspended user and allows them otherwise", async () => {
    const { error: denied } = await suspended.client
      .schema("sandbox")
      .from("posts")
      .insert({
        authorUserId: suspended.userId,
        title: "Should not land",
        body: "Body.",
      });
    expect(denied).not.toBeNull();

    const { data: allowed, error } = await author.client
      .schema("sandbox")
      .from("posts")
      .insert({ authorUserId: author.userId, title: "Lands", body: "Body." })
      .select("id")
      .single();
    expect(error).toBeNull();
    await deletePosts(allowed!.id as string);
  });

  it("is unreachable on a production instance", async () => {
    const post = await createPost(author, "Visible locally", "Body.");
    try {
      const { data: before } = await author.client
        .schema("sandbox")
        .from("posts")
        .select("id")
        .eq("id", post);
      expect(before).toHaveLength(1);

      await withEnvironment("production", async () => {
        const { data: during } = await author.client
          .schema("sandbox")
          .from("posts")
          .select("id")
          .eq("id", post);
        expect(during).toEqual([]);

        const { error: write } = await author.client
          .schema("sandbox")
          .from("posts")
          .insert({
            authorUserId: author.userId,
            title: "Nope",
            body: "Body.",
          });
        expect(write).not.toBeNull();
      });
    } finally {
      await deletePosts(post);
    }
  });
});

describe("platform.resolve_report", () => {
  it("is refused to a member and to the impersonation entry point", async () => {
    const post = await createPost(author, "Spam", "Buy things.");
    let reportId: string | undefined;
    try {
      const { data } = await reporter.client.rpc("file_report", {
        app_slug: "sandbox",
        content_type: "posts",
        content_ref: post,
        reason_id: spamReason,
      });
      reportId = (data as { reportId: string }).reportId;

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
      await deletePosts(post);
    }
  });

  it("reports a ban back to the caller rather than applying it", async () => {
    // Supabase's native ban needs admin credentials, which a browser does not
    // have. The suspension -- which is what every app's write policies actually
    // consult -- is applied either way.
    const post = await createPost(author, "Spam", "Buy things.");
    let reportId: string | undefined;
    try {
      const { data } = await reporter.client.rpc("file_report", {
        app_slug: "sandbox",
        content_type: "posts",
        content_ref: post,
        reason_id: spamReason,
      });
      reportId = (data as { reportId: string }).reportId;

      const { data: outcome } = await moderator.client.rpc("resolve_report", {
        report_id: reportId,
        subject_action: "ban",
        filer_action: "no_action",
        content_action: "no_action",
        apply_globally: true,
      });
      expect(outcome).toMatchObject({ bannedUserId: author.userId });

      const { data: isSuspended } = await admin().rpc("is_suspended", {
        uid: author.userId,
      });
      expect(isSuspended).toBe(true);
    } finally {
      await admin()
        .from("userSuspensions")
        .delete()
        .eq("userId", author.userId)
        .eq("service", "global");
      if (reportId) await deleteReports(reportId);
      await deletePosts(post);
    }
  });

  it("refuses to decide a report twice", async () => {
    const post = await createPost(author, "Spam", "Buy things.");
    let reportId: string | undefined;
    try {
      const { data } = await reporter.client.rpc("file_report", {
        app_slug: "sandbox",
        content_type: "posts",
        content_ref: post,
        reason_id: spamReason,
      });
      reportId = (data as { reportId: string }).reportId;

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
      await deletePosts(post);
    }
  });
});

describe("platform.conformance_check", () => {
  it("passes for the sandbox, and is refused to a member", async () => {
    const { error } = await reporter.client.rpc("conformance_check", {
      app_slug: "sandbox",
    });
    expect(error?.message).toMatch(/canModerate/);

    const { data } = await moderator.client.rpc("conformance_check", {
      app_slug: "sandbox",
    });
    const failures = (
      data as { contentType: string; checks: { name: string; ok: boolean }[] }[]
    ).flatMap((t) =>
      t.checks.filter((c) => !c.ok).map((c) => `${t.contentType}.${c.name}`),
    );
    expect(failures).toEqual([]);
  });

  it("catches a table-wide UPDATE grant that re-exposes the quarantine column", async () => {
    // The mistake the check exists for: column-level REVOKE does not override a
    // table-level grant, so this is what an app looks like when it followed the
    // obvious-but-wrong integration snippet.
    await sql().unsafe(`grant update on sandbox."posts" to authenticated`);
    try {
      const { data } = await moderator.client.rpc("conformance_check", {
        app_slug: "sandbox",
      });
      const posts = (
        data as {
          contentType: string;
          checks: { name: string; ok: boolean }[];
        }[]
      ).find((t) => t.contentType === "posts");
      const protectedCheck = posts?.checks.find(
        (c) => c.name === "quarantine_protected",
      );
      expect(protectedCheck?.ok).toBe(false);
    } finally {
      await sql().unsafe(`revoke update on sandbox."posts" from authenticated`);
      await sql().unsafe(
        `grant update ("title", "body") on sandbox."posts" to authenticated`,
      );
    }
  });
});

describe("platform.apps", () => {
  it("registers the sandbox", async () => {
    expect(sandboxAppId).toBeTruthy();
  });
});
