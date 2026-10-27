/**
 * `import involvement` end to end against fake production: a fixed account
 * list, an Auth admin that hands out ids, and an apply step that records what
 * it was given.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runInvolvement, type InvolvementDeps } from "./commands.js";
import type { AccountRow } from "@devdogsuga/events/imports";
import type { ProfileWrite } from "./store.js";

const ROSTER = [
  "Organization Roster",
  "",
  "DevDogs,9/28/2026",
  '"First Name","Last Name","Campus Email","Organization Name","Position Name"',
  '"Ada","Lovelace","ada@uga.edu","DevDogs","Member"',
  '"Alan","Turing","alan@uga.edu","DevDogs","Member"',
].join("\r\n");

const ACCOUNTS: AccountRow[] = [
  {
    userId: "u-ada",
    authEmail: "ada@uga.edu",
    ugaEmail: null,
    hasProfile: true,
    preferredName: "Ada",
    involvementFirstName: null,
    involvementLastName: null,
  },
  {
    userId: "u-gone",
    authEmail: "gone@uga.edu",
    ugaEmail: "gone@uga.edu",
    hasProfile: true,
    preferredName: "Gone Member",
    involvementFirstName: "Gone",
    involvementLastName: "Member",
  },
];

let stderr: string;
let applied: ProfileWrite[] | undefined;
let created: string[];

function deps(overrides: Partial<InvolvementDeps> = {}): InvolvementDeps {
  return {
    readFile: async () => ROSTER,
    accounts: async () => ACCOUNTS,
    createAccount: async (email) => {
      created.push(email);
      return `u-new-${email}`;
    },
    apply: async (writes) => {
      applied = [...writes];
      return { written: writes.length, cleared: 1 };
    },
    interactive: false,
    ...overrides,
  };
}

beforeEach(() => {
  stderr = "";
  applied = undefined;
  created = [];
  process.exitCode = undefined;
  vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    stderr += String(chunk);
    return true;
  });
  process.env.CI = "true";
});

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

describe("import involvement", () => {
  it("previews without writing on --dry-run", async () => {
    await runInvolvement(["--file", "r.csv", "--dry-run"], deps());
    expect(process.exitCode).toBeUndefined();
    expect(stderr).toContain("1 newly verified");
    expect(stderr).toContain("1 without an account");
    expect(stderr).toContain("Losing verification:\n  Gone Member");
    expect(stderr).toContain("Ada: roster says Ada Lovelace");
    expect(created).toEqual([]);
    expect(applied).toBeUndefined();
  });

  it("refuses to write without --yes when nobody can answer", async () => {
    await runInvolvement(["--file", "r.csv"], deps());
    expect(process.exitCode).toBe(1);
    expect(stderr).toContain("--yes");
    expect(applied).toBeUndefined();
  });

  it("creates the missing accounts, then writes everyone on the roster", async () => {
    await runInvolvement(["--file", "r.csv", "--yes"], deps());
    expect(process.exitCode).toBeUndefined();
    expect(created).toEqual(["alan@uga.edu"]);
    expect(applied).toEqual([
      {
        userId: "u-ada",
        email: "ada@uga.edu",
        firstName: "Ada",
        lastName: "Lovelace",
      },
      {
        userId: "u-new-alan@uga.edu",
        email: "alan@uga.edu",
        firstName: "Alan",
        lastName: "Turing",
      },
    ]);
  });

  it("still imports the rest when an account cannot be created, and exits 1", async () => {
    await runInvolvement(
      ["--file", "r.csv", "--yes"],
      deps({
        createAccount: async () => {
          throw new Error("rate limited");
        },
      }),
    );
    expect(process.exitCode).toBe(1);
    expect(stderr).toContain("alan@uga.edu: rate limited");
    expect(applied?.map((w) => w.userId)).toEqual(["u-ada"]);
  });

  it("refuses another organization's roster", async () => {
    await runInvolvement(
      ["--file", "r.csv", "--yes"],
      deps({
        readFile: async () => ROSTER.replaceAll('"DevDogs"', '"Chess Club"'),
      }),
    );
    expect(process.exitCode).toBe(1);
    expect(stderr).toContain("for Chess Club, not DevDogs");
    expect(applied).toBeUndefined();
  });

  it("asks for --file when nobody can answer", async () => {
    await runInvolvement([], deps());
    expect(process.exitCode).toBe(1);
    expect(stderr).toContain("--file");
  });
});
