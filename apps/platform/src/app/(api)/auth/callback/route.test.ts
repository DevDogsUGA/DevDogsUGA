// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const cookieJar = vi.hoisted(() => new Map<string, string>());
const exchange = vi.hoisted(() => vi.fn());
const signOut = vi.hoisted(() => vi.fn());
const createUser = vi.hoisted(() => vi.fn());
const reportSignInIncident = vi.hoisted(() => vi.fn());
const NonUga = vi.hoisted(() => class NonUga extends Error {});

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { value: cookieJar.get(name) } : undefined,
    has: (name: string) => cookieJar.has(name),
    delete: (name: string) => cookieJar.delete(name),
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  unauthorized: () => {
    throw new Error("UNAUTHORIZED");
  },
}));
vi.mock("~/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { exchangeCodeForSession: exchange, signOut },
  }),
}));
vi.mock("~/server/auth", () => ({ expectUserWith: vi.fn() }));
vi.mock("~/server/auth/providers/google", () => ({
  createUser,
  NonUgaGoogleAccountError: NonUga,
}));
vi.mock("~/server/auth/providers/discord", () => ({}));
vi.mock("~/server/auth/providers/github", () => ({}));
vi.mock("~/server/auth/providers/linkedin", () => ({}));
vi.mock("~/server/auth/signInIncident", () => ({ reportSignInIncident }));
// Nobody here is scheduled for deletion; the real module is `server-only`.
vi.mock("~/server/accountDeletion/schedule", () => ({
  getPendingDeletion: async () => null,
}));

import { GET } from "./route";

function call(query: string) {
  return GET({
    nextUrl: new URL(`https://example.test/auth/callback?${query}`),
  } as never).then(
    () => "returned",
    (error: Error) => error.message,
  );
}

beforeEach(() => {
  cookieJar.clear();
  cookieJar.set("auth_intent", "sign-in:google");
  exchange.mockReset();
  signOut.mockReset();
  createUser.mockReset();
  reportSignInIncident.mockReset();
  vi.spyOn(console, "warn").mockReturnValue(undefined);
  vi.spyOn(console, "error").mockReturnValue(undefined);
});

describe("GET /auth/callback, signing in", () => {
  it("sends a cancellation to the recovery page, keeping the destination, with no reference", async () => {
    cookieJar.set("auth_callback_path", "/attendance/complete");
    expect(await call("error=access_denied")).toBe(
      "REDIRECT /auth/failed?reason=cancelled&returnTo=%2Fattendance%2Fcomplete",
    );
    expect(reportSignInIncident).not.toHaveBeenCalled();
  });

  it("sends a wrong account to the recovery page and signs the session out, with no reference", async () => {
    cookieJar.set("auth_callback_path", "/attendance/complete");
    exchange.mockResolvedValue({
      data: { session: {}, user: { id: "u" } },
      error: null,
    });
    createUser.mockRejectedValue(new NonUga());
    expect(await call("code=abc")).toBe(
      "REDIRECT /auth/failed?reason=wrong_account&returnTo=%2Fattendance%2Fcomplete",
    );
    expect(signOut).toHaveBeenCalled();
    expect(reportSignInIncident).not.toHaveBeenCalled();
  });

  it("records an incident for a failed code exchange and shows its reference", async () => {
    exchange.mockResolvedValue({
      data: { session: null, user: null },
      error: { code: "flow_state_not_found", status: 400 },
    });
    const result = await call("code=abc");
    expect(result).toMatch(
      /^REDIRECT \/auth\/failed\?reason=unexpected&ref=SI-[0-9A-Z]{8}$/,
    );
    const ref = result.split("ref=")[1];
    expect(reportSignInIncident).toHaveBeenCalledWith({
      ref,
      stage: "code_exchange",
      code: "flow_state_not_found",
      status: 400,
    });
  });

  it("records an incident when the provider reports a real error", async () => {
    expect(
      await call("error=server_error&error_code=unexpected_failure"),
    ).toMatch(/^REDIRECT \/auth\/failed\?reason=unexpected&ref=SI-/);
    expect(reportSignInIncident).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: "provider_error",
        code: "unexpected_failure",
      }),
    );
  });

  it("records an incident when the profile can't be created", async () => {
    exchange.mockResolvedValue({
      data: { session: {}, user: { id: "u" } },
      error: null,
    });
    createUser.mockRejectedValue(new Error("db down"));
    expect(await call("code=abc")).toMatch(
      /^REDIRECT \/auth\/failed\?reason=unexpected&ref=SI-/,
    );
    expect(reportSignInIncident).toHaveBeenCalledWith(
      expect.objectContaining({ stage: "profile_setup" }),
    );
  });

  it("refuses an unsafe stored destination", async () => {
    cookieJar.set("auth_callback_path", "//evil.example");
    exchange.mockResolvedValue({
      data: { session: {}, user: { id: "u" } },
      error: null,
    });
    createUser.mockResolvedValue(undefined);
    expect(await call("code=abc")).toBe("REDIRECT /");
  });

  it("is still a 404 for a visit that never began a sign-in", async () => {
    cookieJar.clear();
    expect(await call("")).toBe("NOT_FOUND");
  });
});

describe("GET /auth/callback, linking an account", () => {
  it("keeps a provider rejection in the settings flow", async () => {
    cookieJar.set("auth_intent", "link:github");
    cookieJar.set("auth_callback_path", "/settings/accounts");
    expect(await call("error=access_denied")).toBe(
      "REDIRECT /settings/accounts?connectedAccountStatus=error&connectedAccountCode=access_denied&connectedAccountProvider=github",
    );
    expect(reportSignInIncident).not.toHaveBeenCalled();
  });
});
