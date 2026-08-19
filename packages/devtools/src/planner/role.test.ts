import { describe, expect, it } from "vitest";
import {
  createRoleSql,
  generatePassword,
  plannerUrlFrom,
  resetPasswordSql,
} from "./role.js";

describe("createRoleSql", () => {
  it("issues the validated grant pair, byte for byte", () => {
    // The security plan's §3.5 grants, asserted rather than paraphrased. A
    // wider grant here is the credential `main` must not hold.
    const [create, ...grants] = createRoleSql("pw");
    expect(create).toBe("create role migration_planner login password 'pw'");
    expect(grants).toEqual([
      "grant usage on schema supabase_migrations to migration_planner",
      "grant select on supabase_migrations.schema_migrations to migration_planner",
    ]);
  });

  it("resets with ALTER, touching no grants", () => {
    expect(resetPasswordSql("pw")).toBe(
      "alter role migration_planner password 'pw'",
    );
  });
});

describe("generatePassword", () => {
  it("stays inside the base64url alphabet, which both consumers rely on", () => {
    // The password is interpolated into a SQL literal (no quote, no
    // backslash) and into a URL's userinfo (no percent-encoding). One
    // character outside this alphabet breaks one of the two silently.
    for (let i = 0; i < 32; i++) {
      expect(generatePassword()).toMatch(/^[A-Za-z0-9_-]{32}$/);
    }
  });
});

describe("plannerUrlFrom", () => {
  it("keeps the pooler's project-ref suffix on the swapped username", () => {
    expect(
      plannerUrlFrom(
        "postgresql://postgres.abcdefgh:oldpw@aws-0-us-east-1.pooler.supabase.com:5432/postgres",
        "newpw",
      ),
    ).toBe(
      "postgresql://migration_planner.abcdefgh:newpw@aws-0-us-east-1.pooler.supabase.com:5432/postgres",
    );
  });

  it("swaps a bare username on a direct connection", () => {
    expect(
      plannerUrlFrom(
        "postgresql://postgres:oldpw@db.example.com:5432/postgres",
        "newpw",
      ),
    ).toBe("postgresql://migration_planner:newpw@db.example.com:5432/postgres");
  });

  it("never carries the admin password over", () => {
    const url = plannerUrlFrom(
      "postgresql://postgres.ref:admin-secret@host:5432/postgres",
      "planner-pw",
    );
    expect(url).not.toContain("admin-secret");
  });
});
