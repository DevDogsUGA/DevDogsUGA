import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  admin,
  anon,
  createPersona,
  destroyPersonas,
  type Persona,
} from "./personas";

const tables = [
  "githubRepos",
  "projectRepos",
  "projectOwners",
  "commits",
  "repoCommits",
  "projectReportCommits",
  "hackathons",
  "submissions",
  "submissionMembers",
  "repoSyncState",
  "projectSyncJobs",
  "commitBackfillRequests",
  "projectDocsProposals",
  "projectRepoDetails",
] as const;
let member: Persona;
beforeAll(async () => {
  member = await createPersona("d178-rls");
});
afterAll(async () => {
  await destroyPersonas(member);
});
describe("D1 server-only Project objects", () => {
  it.each(tables)(
    "denies browser reads and permits service reads: %s",
    async (table) => {
      for (const client of [anon(), member.client]) {
        const { error } = await client.from(table).select("*").limit(1);
        expect(error?.code).toBe("42501");
      }
      const { error } = await admin().from(table).select("*").limit(1);
      expect(error).toBeNull();
    },
  );
  it.each(tables.filter((t) => t !== "projectRepoDetails"))(
    "denies browser writes: %s",
    async (table) => {
      for (const client of [anon(), member.client]) {
        const { error: insertError } = await client.from(table).insert({});
        expect(insertError?.code).toBe("42501");
        const key = ["githubRepos", "repoSyncState"].includes(table)
          ? "githubRepoId"
          : ["projectRepos", "projectOwners"].includes(table)
            ? "projectId"
            : ["commits", "repoCommits", "projectReportCommits"].includes(table)
              ? "sha"
              : table === "submissionMembers"
                ? "submissionId"
                : table === "projectSyncJobs"
                  ? "job"
                  : table === "commitBackfillRequests"
                    ? "userId"
                    : "id";
        const { error: updateError } = await client
          .from(table)
          .update({ [key]: null })
          .not(key, "is", null);
        expect(updateError?.code).toBe("42501");
        const { error: deleteError } = await client
          .from(table)
          .delete()
          .not(key, "is", null);
        expect(deleteError?.code).toBe("42501");
      }
    },
  );
});

// Check the backing grants/policies too: service_role has full CRUD, and browser
// denial has both explicit ACL revocation and restrictive false-policy layers.
it.each(tables.filter((table) => table !== "projectRepoDetails"))(
  "retains server CRUD and all four restrictive policies: %s",
  async (table) => {
    const { sql } = await import("./personas");
    const [row] = await sql()`
      select (has_table_privilege('service_role', ${`platform."${table}"`}, 'SELECT') and has_table_privilege('service_role', ${`platform."${table}"`}, 'INSERT') and has_table_privilege('service_role', ${`platform."${table}"`}, 'UPDATE') and has_table_privilege('service_role', ${`platform."${table}"`}, 'DELETE')) as server,
             has_table_privilege('anon', ${`platform."${table}"`}, 'SELECT,INSERT,UPDATE,DELETE') as anon,
             has_table_privilege('authenticated', ${`platform."${table}"`}, 'SELECT,INSERT,UPDATE,DELETE') as authenticated,
             (select count(*)::int from pg_policies where schemaname = 'platform' and tablename = ${table}
               and permissive = 'RESTRICTIVE' and coalesce(qual, with_check) = 'false') as policies
    `;
    expect(row).toMatchObject({
      server: true,
      anon: false,
      authenticated: false,
      policies: 4,
    });
  },
);
