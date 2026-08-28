import "./loadEnv";

import { asc, desc, eq, sql } from "drizzle-orm";
import { db } from "~/server/db";
import { profileLinks, profiles, roles, userRoles } from "~/server/db/schema";
import { usersInAuth } from "~/supabase/drizzle/schema";
import { OFFICER_SEEDS, OFFICER_TITLE_ORDER } from "./officers.data";

/**
 * Seeds the executive board into the profile and role system.
 *
 * A script rather than `supabase/seed/*.sql` for the reason 02_moderation.sql
 * states at the top of itself: seeds run only on `db reset`, against a local
 * stack or a throwaway project, never production. This is real content about
 * real people that has to reach the deployed site, so it follows
 * `seed-builtin-roles.ts` -- the existing precedent for rows production needs.
 *
 * ============================================================
 * Filling gaps, never overwriting
 * ============================================================
 *
 * Every write below is a gap-fill. An officer who has already written their
 * own bio, set their own graduation year or picked their own preferred name
 * keeps all of it; the submission only supplies what is still empty. That is
 * what makes the script safe to re-run, and it is also the honest policy --
 * the emails were sent in July and the officer's own account is newer than
 * they are.
 *
 * For scalars that means `coalesce(existing, submitted)`. For the three array
 * columns it means "replace only when empty", since `'{}'` is the not-filled-in
 * state for those.
 *
 * ============================================================
 * Matching officers to accounts, and the caveat that comes with it
 * ============================================================
 *
 * Officers are matched on `auth.users.email`, case-insensitively, against the
 * address they submitted from. Where there is no such user this script creates
 * one, which is what the board asked for -- but it is worth being plain about
 * the hazard, because it is not hypothetical:
 *
 *   Three officers wrote from personal Gmail, so that is the only address
 *   known for them. If one of them later signs in through GitHub, Discord or
 *   LinkedIn with a different address, GoTrue mints a NEW user, and the
 *   profile seeded here is orphaned -- their card keeps the seeded content
 *   while their real account has none.
 *
 * A created user has no `auth.identities` row and therefore cannot sign in;
 * it is a placeholder holding content until the person arrives. If you know an
 * officer's real account, the durable fix is to correct their address in
 * `officers.data.ts` BEFORE the first run rather than to merge users after.
 */

/**
 * Deterministic ids for officers this script creates, so a re-run finds the
 * same row and so the headshot key in the `avatars` bucket -- which is the
 * bare user id -- is knowable before the upload.
 *
 * Same v4-shaped literal space as the moderation personas
 * (`00000000-0000-4000-a000-...`), one block along, so the two can never
 * collide.
 */
function seededUserId(index: number): string {
  return `00000000-0000-4000-b000-${String(index + 1).padStart(12, "0")}`;
}

async function findUserIdByEmail(email: string): Promise<string | null> {
  const [row] = await db
    .select({ id: usersInAuth.id })
    .from(usersInAuth)
    .where(sql`lower(${usersInAuth.email}) = ${email.toLowerCase()}`)
    .limit(1);
  return row?.id ?? null;
}

/**
 * Creates a placeholder auth user.
 *
 * The four empty strings are not decoration -- 02_moderation.sql explains
 * them: GoTrue scans confirmation_token, recovery_token,
 * email_change_token_new and email_change into non-nullable Go strings, and
 * those columns have no database default, so a row without them breaks every
 * sign-in with an error that names neither the column nor the user.
 *
 * No password and no `auth.identities` row: this account is a container for
 * submitted content, not a way in.
 */
async function createPlaceholderUser(id: string, email: string) {
  await db.execute(sql`
    insert into auth.users (
      "id", "instance_id", "aud", "role", "email",
      "raw_app_meta_data", "raw_user_meta_data",
      "confirmation_token", "recovery_token",
      "email_change_token_new", "email_change",
      "created_at", "updated_at"
    ) values (
      ${id}, '00000000-0000-0000-0000-000000000000', 'authenticated',
      'authenticated', ${email},
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      '', '', '', '', now(), now()
    )
    on conflict ("id") do nothing
  `);
}

/**
 * Officer titles as leadership roles.
 *
 * `isLeadership` is what the homepage selects on and what
 * `resolvedUserPermissions` reads for `isLeader` -- which is also the flag
 * that reveals the Role Description field on /account. Marking these roles
 * leadership is therefore what lets each officer edit the bio their own card
 * prints, which is the point.
 *
 * Ranks are allocated after the current maximum rather than hardcoded:
 * `roles.rank` is UNIQUE and `roles_custom_requires_rank` ties a non-null rank
 * to roleType 'custom', so a fixed number here would collide with whatever the
 * console has already created. Existing roles are not leadership, so
 * appending still orders the board correctly among the roles that matter.
 *
 * No permissions are granted. Every `can*` column is left null, which resolves
 * to false -- being on the homepage is not a reason to gain moderation rights.
 */
async function ensureOfficerRoles(): Promise<Map<string, string>> {
  const byTitle = new Map<string, string>();

  const [max] = await db
    .select({ rank: roles.rank })
    .from(roles)
    .orderBy(desc(roles.rank))
    .limit(1);
  let nextRank = (max?.rank ?? 0) + 1;

  for (const title of OFFICER_TITLE_ORDER) {
    const [existing] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.title, title))
      .limit(1);

    if (existing) {
      // Do not touch rank or colour -- an officer may have reordered or
      // restyled the role in the console since. Only the flags this script is
      // responsible for are asserted.
      await db
        .update(roles)
        .set({ isLeadership: true, showOnProfile: true })
        .where(eq(roles.id, existing.id));
      byTitle.set(title, existing.id);
      continue;
    }

    const [created] = await db
      .insert(roles)
      .values({
        title,
        description: `${title} of DevDogs.`,
        roleType: "custom",
        rank: nextRank++,
        isLeadership: true,
        showOnProfile: true,
      })
      .returning({ id: roles.id });

    if (created) byTitle.set(title, created.id);
  }

  return byTitle;
}

async function main() {
  const roleIdByTitle = await ensureOfficerRoles();
  const mapping: { slug: string; userId: string; created: boolean }[] = [];

  for (const [index, officer] of OFFICER_SEEDS.entries()) {
    let userId = await findUserIdByEmail(officer.email);
    const created = userId === null;

    if (userId === null) {
      userId = seededUserId(index);
      await createPlaceholderUser(userId, officer.email);
    }

    // `preferredName` is NOT NULL, so it can only be supplied on insert; an
    // existing profile keeps whatever name its owner chose.
    await db
      .insert(profiles)
      .values({
        userId,
        preferredName: officer.preferredName,
        roleDescription: officer.roleDescription,
        majors: officer.majors,
        minors: officer.minors,
        certificates: officer.certificates,
        graduationYear: officer.graduationYear,
      })
      .onConflictDoUpdate({
        target: profiles.userId,
        set: {
          roleDescription: sql`coalesce(${profiles.roleDescription}, excluded."roleDescription")`,
          graduationYear: sql`coalesce(${profiles.graduationYear}, excluded."graduationYear")`,
          majors: sql`case when cardinality(${profiles.majors}) = 0 then excluded."majors" else ${profiles.majors} end`,
          minors: sql`case when cardinality(${profiles.minors}) = 0 then excluded."minors" else ${profiles.minors} end`,
          certificates: sql`case when cardinality(${profiles.certificates}) = 0 then excluded."certificates" else ${profiles.certificates} end`,
        },
      });

    // Links are gap-filled as a set: an officer who has added any link of
    // their own owns that list, and the submission does not push into it.
    if (officer.links.length > 0) {
      const [existingLink] = await db
        .select({ id: profileLinks.id })
        .from(profileLinks)
        .where(eq(profileLinks.userId, userId))
        .limit(1);

      if (!existingLink) {
        await db
          .insert(profileLinks)
          .values(
            officer.links.map((link, order) => ({
              userId,
              title: link.title,
              url: link.url,
              sortOrder: order,
            })),
          )
          .onConflictDoNothing();
      }
    }

    if (officer.title) {
      const roleId = roleIdByTitle.get(officer.title);
      if (roleId) {
        await db
          .insert(userRoles)
          .values({ userId, roleId })
          .onConflictDoNothing();
      }
    }

    mapping.push({ slug: officer.slug, userId, created });
  }

  // The headshot key in the `avatars` bucket is the bare user id, so this
  // mapping is what an upload needs. Printed rather than written to a file:
  // it pairs a real person with an account id, and the archive is a better
  // home for that than the repo.
  console.log("\nslug -> userId (avatars bucket key)\n");
  for (const row of mapping) {
    console.log(
      `  ${row.slug.padEnd(18)} ${row.userId}  ${row.created ? "(created)" : "(existing)"}`,
    );
  }

  const unassigned = OFFICER_SEEDS.filter((o) => !o.title).map((o) => o.slug);
  if (unassigned.length > 0) {
    console.log(
      `\nSeeded but not on the homepage -- no DevDogs title stated: ${unassigned.join(", ")}`,
    );
  }

  const president = roleIdByTitle.get("President");
  if (president) {
    const [holder] = await db
      .select({ userId: userRoles.userId })
      .from(userRoles)
      .where(eq(userRoles.roleId, president))
      .orderBy(asc(userRoles.userId))
      .limit(1);
    if (!holder) {
      console.log("\nPresident exists but is unassigned. Assign it with:");
      console.log(
        `  insert into platform."userRoles" ("userId", "roleId") values ('<your user id>', '${president}');`,
      );
    }
  }
}

await main();
process.exit(0);
