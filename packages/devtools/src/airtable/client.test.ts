/**
 * Which Airtable token a command authenticates with.
 *
 * The decision is one line of `find()`, and it is the line that decides whether
 * the §3.5 dry run, which runs from `main`, holds a credential that can
 * restructure the officers' base. `AIRTABLE_SYNC_PAT` satisfies a read as well
 * as the plan token does, so "prefers the narrower" is not observable from the
 * happy path: the read assertions below set more than one variable on purpose,
 * because a lookup that ignored the ordering would pass every single-variable
 * test.
 *
 * The write row has one entry since `AIRTABLE_PAT` was removed, so there is no
 * ordering left to get wrong there, only a fallback that must not reappear,
 * which is what the disjointness test pins.
 *
 * Nothing here opens a socket. `resolveAirtableCredentials` takes both the
 * environment and the fetch, so the branch under test is chosen by the test
 * rather than by whatever the runner happens to hold.
 */
import { describe, expect, it } from "vitest";
import { BASE_ID } from "@devdogsuga/airtable";
import {
  AirtableCredentialError,
  CREDENTIAL_PREFERENCE,
  airtableClient,
  resolveAirtableCredentials,
  type AirtableCapability,
} from "./client.js";

const BASE = "appTESTTESTTEST01";

/** A fetch that refuses to be called: nothing here should reach the network. */
const noFetch: typeof globalThis.fetch = () => {
  throw new Error("the credential resolver must not make a request");
};

function resolve(need: AirtableCapability, env: NodeJS.ProcessEnv) {
  return resolveAirtableCredentials({
    need,
    env: { AIRTABLE_BASE_ID: BASE, ...env },
    fetch: noFetch,
  });
}

describe("prefer the narrower token", () => {
  it("reads with AIRTABLE_PLAN_PAT even when AIRTABLE_SYNC_PAT is also set", () => {
    // THE test. Both are set, the state a laptop is in if somebody has pulled
    // a CI credential into their env file, and the schema-only one has to win.
    const { variable } = resolve("read", {
      AIRTABLE_PLAN_PAT: "plan",
      AIRTABLE_SYNC_PAT: "sync",
    });
    expect(variable).toBe("AIRTABLE_PLAN_PAT");
  });

  it("prefers the narrower one whichever order the environment lists them", () => {
    // The array decides the preference, not object key order. Written out
    // because `find()` over `Object.keys(env)` would pass the test above on a
    // differently-ordered environment and fail on a real one.
    const { variable } = resolve("read", {
      AIRTABLE_SYNC_PAT: "sync",
      AIRTABLE_PLAN_PAT: "plan",
    });
    expect(variable).toBe("AIRTABLE_PLAN_PAT");
  });
});

describe("the split between reading and writing", () => {
  it("reads with AIRTABLE_SYNC_PAT when no plan token is set", () => {
    // The ordinary laptop case: no CI credential present, and the token the
    // running platform uses is the one that can also see records.
    const { variable } = resolve("read", { AIRTABLE_SYNC_PAT: "sync" });
    expect(variable).toBe("AIRTABLE_SYNC_PAT");
  });

  it("refuses a write with only the sync token, which can read every record", () => {
    // ⚠️ The reason the write row has one entry. AIRTABLE_SYNC_PAT carries
    // `data.records:read`/`:write` and `schema.bases:read`: enough to rewrite
    // every dues record and nowhere near enough to reshape the base. Letting
    // it satisfy a write would turn a named refusal into a 403 partway through
    // a schema change, and would put a schema-change path on any machine
    // holding the runtime token.
    expect(() => resolve("write", { AIRTABLE_SYNC_PAT: "sync" })).toThrow(
      AirtableCredentialError,
    );
  });

  it("has no operator token left to fall back to", () => {
    // The removal, asserted rather than assumed. `AIRTABLE_PAT` used to sit at
    // the end of both rows and satisfy either capability; a reintroduction
    // would otherwise be silent.
    expect(() => resolve("read", { AIRTABLE_PAT: "full" })).toThrow(
      AirtableCredentialError,
    );
    expect(() => resolve("write", { AIRTABLE_PAT: "full" })).toThrow(
      AirtableCredentialError,
    );
  });

  it("never reaches for the write token to satisfy a read", () => {
    // AIRTABLE_APPLY_PAT *would* work; it carries schema.bases:read too. That
    // is the reason to refuse it: a plan that quietly ran on the write token
    // makes the production-apply reviewer gate decorative, and nothing would
    // ever report that it had happened.
    expect(() => resolve("read", { AIRTABLE_APPLY_PAT: "apply" })).toThrow(
      AirtableCredentialError,
    );
  });

  it("never reaches for the plan token to satisfy a write", () => {
    // The opposite failure: AIRTABLE_PLAN_PAT genuinely cannot write, so a
    // fallback here would turn a named refusal into a 403 partway through a
    // schema change, with the base half modified.
    expect(() => resolve("write", { AIRTABLE_PLAN_PAT: "plan" })).toThrow(
      AirtableCredentialError,
    );
  });

  it("keeps the two preference lists fully disjoint", () => {
    // The structural statement of the tests above, so a token added to one row
    // cannot silently join the other. They share no member at all now; the one
    // they used to share was AIRTABLE_PAT.
    expect(CREDENTIAL_PREFERENCE.read).toEqual([
      "AIRTABLE_PLAN_PAT",
      "AIRTABLE_SYNC_PAT",
    ]);
    expect(CREDENTIAL_PREFERENCE.write).toEqual(["AIRTABLE_APPLY_PAT"]);
    const shared = CREDENTIAL_PREFERENCE.read.filter((n) =>
      CREDENTIAL_PREFERENCE.write.includes(n),
    );
    expect(shared).toEqual([]);
  });
});

describe("the refusal names what it looked at", () => {
  it("lists the variables checked for a read, and not the write-only one", () => {
    let error: unknown;
    try {
      resolve("read", {});
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(AirtableCredentialError);
    const detail = (error as AirtableCredentialError).detail.join("\n");
    expect(detail).toContain("AIRTABLE_PLAN_PAT, AIRTABLE_SYNC_PAT");
    // Named in the prose as the token deliberately NOT consulted, which is the
    // question somebody staring at a red plan job will actually have.
    expect(detail).toContain("AIRTABLE_APPLY_PAT is NOT consulted");
  });

  it("lists the variables checked for a write", () => {
    let error: unknown;
    try {
      resolve("write", {});
    } catch (e) {
      error = e;
    }
    const detail = (error as AirtableCredentialError).detail.join("\n");
    expect(detail).toContain("AIRTABLE_APPLY_PAT");
    expect(detail).toContain("AIRTABLE_PLAN_PAT is NOT consulted");
  });

  it("refuses an empty string the same way it refuses an unset variable", () => {
    // A workflow referencing a secret the environment does not hold
    // interpolates to "". Treating that as set builds a client that 401s from
    // a vendor instead of naming the variable, exactly the silent shape this
    // whole change exists to remove.
    expect(() => resolve("read", { AIRTABLE_PLAN_PAT: "" })).toThrow(
      AirtableCredentialError,
    );
    // And it falls THROUGH an empty one to a set one rather than stopping.
    expect(
      resolve("read", { AIRTABLE_PLAN_PAT: "", AIRTABLE_SYNC_PAT: "sync" })
        .variable,
    ).toBe("AIRTABLE_SYNC_PAT");
  });
});

describe("the base id comes from the registry", () => {
  it("falls back to the committed base when nothing overrides it", () => {
    // This used to refuse by name: the base id was an environment variable, so
    // an unset one meant there was no base to talk to. It is `BASE_ID` in the
    // registry now, beside the field ids belonging to that same base, so the
    // ordinary case is an env with no base id in it at all.
    expect(
      resolveAirtableCredentials({
        need: "read",
        env: { AIRTABLE_PLAN_PAT: "plan" },
        fetch: noFetch,
      }).baseId,
    ).toBe(BASE_ID);
  });

  it("still honours an override, so a scratch base can be aimed at", () => {
    // The half that keeps the constant from being a hard-coding. Empty is not
    // an override: a workflow referencing a variable the environment does not
    // hold interpolates to "", and that must read as "unset" rather than
    // sending the tooling at a base called "".
    expect(
      resolveAirtableCredentials({
        need: "read",
        env: { AIRTABLE_PLAN_PAT: "plan", AIRTABLE_BASE_ID: "appSCRATCH" },
        fetch: noFetch,
      }).baseId,
    ).toBe("appSCRATCH");
    expect(
      resolveAirtableCredentials({
        need: "read",
        env: { AIRTABLE_PLAN_PAT: "plan", AIRTABLE_BASE_ID: "" },
        fetch: noFetch,
      }).baseId,
    ).toBe(BASE_ID);
  });
});

describe("the airtable group's wrapper", () => {
  it("returns null rather than throwing, so the commands can set an exit code", () => {
    // `explain()` writes to stdout, which is fine for this group and forbidden
    // in `deploy/`, hence two entry points onto one resolver.
    expect(airtableClient({ need: "read", env: {}, fetch: noFetch })).toBe(
      null,
    );
  });

  it("POSITIVE CONTROL: returns credentials when the token is there", () => {
    // Without this, the assertion above would pass just as well if the wrapper
    // returned null unconditionally.
    const credentials = airtableClient({
      need: "read",
      env: { AIRTABLE_BASE_ID: BASE, AIRTABLE_PLAN_PAT: "plan" },
      fetch: noFetch,
    });
    expect(credentials?.baseId).toBe(BASE);
    expect(credentials?.variable).toBe("AIRTABLE_PLAN_PAT");
    expect(credentials?.need).toBe("read");
  });
});
