import { sql } from "drizzle-orm";
import { db } from "~/server/db";

/**
 * Fixtures for the public-profile db tests. Not a test file itself: the db
 * config only collects `*.db-test.ts`.
 *
 * Every id a test uses is listed up front and swept by `deleteMembers`, because
 * the local database is shared with other sessions and nothing here may linger.
 */

export interface MemberFixture {
  id: string;
  /** Roster first/last name. Verified members must have these. */
  first?: string;
  last?: string;
  legalFirst?: string;
  legalLast?: string;
  ugaEmail?: string | null;
  preferredName?: string;
  /** Full verification (pronouns, graduation, names, github, discord). Default true. */
  verified?: boolean;
  github?: string | null;
  /** Discord username, stored in `full_name` like Supabase's provider does. */
  discord?: string | null;
  linkedin?: string | null;
  handle?: string | null;
  createdAt?: string;
  profile?: Record<string, boolean>;
  bio?: string | null;
  roleDescription?: string | null;
}

export async function insertMember(m: MemberFixture): Promise<void> {
  const first = m.first ?? "Test";
  const last = m.last ?? "Member";
  const verified = m.verified ?? true;
  const github = m.github === undefined ? `gh-${m.id.slice(-6)}` : m.github;
  const discord = m.discord === undefined ? `dc-${m.id.slice(-6)}` : m.discord;

  await db.execute(sql`
    insert into auth.users (id, instance_id, aud, role, email, created_at)
    values (${m.id}::uuid, '00000000-0000-0000-0000-000000000000',
            'authenticated', 'authenticated', ${`pp-dbtest-${m.id}@persona.test`},
            ${m.createdAt ?? new Date().toISOString()}::timestamptz)
  `);
  for (const [provider, data] of [
    ["github", github === null ? null : { user_name: github }],
    ["discord", discord === null ? null : { full_name: discord }],
    ["linkedin_oidc", m.linkedin ? { name: m.linkedin } : null],
  ] as const) {
    if (!data) continue;
    await db.execute(sql`
      insert into auth.identities (id, user_id, provider, provider_id, identity_data)
      values (gen_random_uuid(), ${m.id}::uuid, ${provider}, ${`${m.id}-${provider}`},
              ${JSON.stringify(data)}::jsonb)
    `);
  }
  await db.execute(sql`
    insert into platform.profile (
      "userId", "preferredName", pronouns, "graduationSemester", "graduationYear",
      "involvementFirstName", "involvementLastName", "legalFirstName", "legalLastName",
      "ugaEmail", handle, bio, "roleDescription"
    ) values (
      ${m.id}::uuid,
      ${m.preferredName ?? `${first} ${last}`},
      ${verified ? sql`array['they','them']` : sql`null`},
      ${verified ? sql`'spring'::platform."graduationSemester"` : sql`null`},
      ${verified ? 2030 : null},
      ${first}, ${last}, ${m.legalFirst ?? first}, ${m.legalLast ?? last},
      ${m.ugaEmail ?? null}, ${m.handle ?? null}, ${m.bio ?? null}, ${m.roleDescription ?? null}
    )
  `);
  for (const [column, value] of Object.entries(m.profile ?? {})) {
    await db.execute(
      sql`update platform.profile set ${sql.identifier(column)} = ${value} where "userId" = ${m.id}::uuid`,
    );
  }
}

export async function deleteMembers(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  const list = sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
  await db.execute(
    sql`delete from platform."rateLimitHits" where "subjectId" in (${list})`,
  );
  // A resolution restricts deletion of its moderator, so reports (and the
  // resolutions cascading from them) go first.
  await db.execute(
    sql`delete from platform.reports where "reporterUserId" in (${list}) or "reportedUserId" in (${list})`,
  );
  await db.execute(
    sql`delete from platform."userSuspensions" where "userId" in (${list})`,
  );
  await db.execute(sql`delete from auth.users where id in (${list})`);
}
