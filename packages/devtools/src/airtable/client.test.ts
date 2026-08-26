/**
 * Which Airtable token a command authenticates with.
 *
 * The decision is one line of `find()`, and it is the line that decides whether
 * the §3.5 dry run — which runs from `main` — holds a credential that can
 * restructure the officers' base. An operator at a terminal usually has the
 * full `AIRTABLE_PAT`, which satisfies BOTH capabilities, so "prefers the
 * narrower" is not observable from the happy path: every assertion below sets
 * more than one variable on purpose, because a lookup that ignored the ordering
 * would pass every single-variable test.
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
  it("reads with AIRTABLE_PLAN_PAT even when AIRTABLE_PAT is also set", () => {
    // THE test. Both are set — which is the ordinary state on an operator's
    // laptop and the state the §3.5 plan job would be in if somebody exported
    // their own token — and the read-only one has to win.
    const { variable } = resolve("read", {
      AIRTABLE_PLAN_PAT: "plan",
      AIRTABLE_PAT: "full",
    });
    expect(variable).toBe("AIRTABLE_PLAN_PAT");
  });

  it("writes with AIRTABLE_APPLY_PAT even when AIRTABLE_PAT is also set", () => {
    const { variable } = resolve("write", {
      AIRTABLE_APPLY_PAT: "apply",
      AIRTABLE_PAT: "full",
    });
    expect(variable).toBe("AIRTABLE_APPLY_PAT");
  });

  it("prefers the narrower one whichever order the environment lists them", () => {
    // Object key order is not the preference — the array is. Written out
    // because `find()` over `Object.keys(env)` would pass both tests above on
    // a differently-ordered environment and fail on a real one.
    const { variable } = resolve("read", {
      AIRTABLE_PAT: "full",
      AIRTABLE_PLAN_PAT: "plan",
    });
    expect(variable).toBe("AIRTABLE_PLAN_PAT");
  });
});

describe("fall back to the operator token, and only to it", () => {
  it("reads with AIRTABLE_PAT when no plan token is set", () => {
    const { variable } = resolve("read", { AIRTABLE_PAT: "full" });
    expect(variable).toBe("AIRTABLE_PAT");
  });

  it("writes with AIRTABLE_PAT when no apply token is set", () => {
    const { variable } = resolve("write", { AIRTABLE_PAT: "full" });
    expect(variable).toBe("AIRTABLE_PAT");
  });

  it("never reaches for the write token to satisfy a read", () => {
    // AIRTABLE_APPLY_PAT *would* work — it carries schema.bases:read too. That
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

  it("keeps the two preference lists disjoint apart from AIRTABLE_PAT", () => {
    // The structural statement of the two tests above, so a fifth token added
    // to one row cannot silently join the other.
    expect(CREDENTIAL_PREFERENCE.read).toEqual([
      "AIRTABLE_PLAN_PAT",
      "AIRTABLE_PAT",
    ]);
    expect(CREDENTIAL_PREFERENCE.write).toEqual([
      "AIRTABLE_APPLY_PAT",
      "AIRTABLE_PAT",
    ]);
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
    expect(detail).toContain("AIRTABLE_PLAN_PAT, AIRTABLE_PAT");
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
    expect(detail).toContain("AIRTABLE_APPLY_PAT, AIRTABLE_PAT");
    expect(detail).toContain("AIRTABLE_PLAN_PAT is NOT consulted");
  });

  it("refuses an empty string the same way it refuses an unset variable", () => {
    // A workflow referencing a secret the environment does not hold
    // interpolates to "". Treating that as set builds a client that 401s from
    // a vendor instead of naming the variable — which is exactly the silent
    // shape this whole change exists to remove.
    expect(() => resolve("read", { AIRTABLE_PLAN_PAT: "" })).toThrow(
      AirtableCredentialError,
    );
    // And it falls THROUGH an empty one to a set one rather than stopping.
    expect(
      resolve("read", { AIRTABLE_PLAN_PAT: "", AIRTABLE_PAT: "full" }).variable,
    ).toBe("AIRTABLE_PAT");
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
    // an override — a workflow referencing a variable the environment does not
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
    // in `deploy/` — hence two entry points onto one resolver.
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
