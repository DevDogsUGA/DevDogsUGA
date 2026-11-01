import { beforeEach, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({
  authenticate: vi.fn(),
  publicAction: vi.fn(),
  update: vi.fn(),
  redirect: vi.fn(),
}));
vi.mock("~/server/auth/access", () => ({
  authorizeSession: async () => ({ ok: false, message: "Signed out" }),
  publicAction: fake.publicAction,
}));
vi.mock("~/server/auth", () => ({
  authenticate: fake.authenticate,
  expectSession: vi.fn(),
  expectUserWith: vi.fn(),
}));
vi.mock("~/server/db", () => ({ db: { update: fake.update } }));
vi.mock("~/supabase/admin", () => ({ supabaseAdmin: {} }));
vi.mock("~/server/oauth/registerClient", () => ({
  createOauthClientAndRegister: vi.fn(),
}));
vi.mock("~/server/oauth/connectCodes", () => ({
  generateConnectCode: vi.fn(),
  sweepExpiredConnectCodes: vi.fn(),
}));
vi.mock("next/navigation", () => ({ redirect: fake.redirect }));

import { approveDevice, denyDevice } from "./oauthDevice";
import { approveConnect, denyConnect } from "./oauthConnect";

beforeEach(() => {
  vi.clearAllMocks();
  fake.authenticate.mockImplementation(() => {
    throw new Error("sign-in");
  });
  fake.redirect.mockImplementation(() => {
    throw new Error("redirect");
  });
});

it("device actions keep the code through sign-in and never write while signed out", async () => {
  const form = new FormData();
  form.set("userCode", "BCDF-GHJK");
  for (const action of [approveDevice, denyDevice]) {
    await expect(action(form)).rejects.toThrow("sign-in");
    expect(fake.authenticate).toHaveBeenLastCalledWith(
      "google",
      "/oauth/device?user_code=BCDF-GHJK",
    );
  }
  expect(fake.update).not.toHaveBeenCalled();
});

const connectForm = () => {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    redirectUri: "http://127.0.0.1:1234/callback",
    callbackUri: "http://127.0.0.1:1234/client",
    codeChallenge: "challenge",
    state: "state",
    label: "My client",
  }))
    form.set(key, value);
  return form;
};

it("connect approval keeps every handoff parameter through sign-in", async () => {
  await expect(approveConnect(connectForm())).rejects.toThrow("sign-in");
  const callback = new URL(
    String(fake.authenticate.mock.calls[0]?.[1]),
    "http://localhost",
  );
  expect(callback.pathname).toBe("/oauth/connect");
  expect(callback.searchParams.get("state")).toBe("state");
  expect(callback.searchParams.get("code_challenge")).toBe("challenge");
  expect(callback.searchParams.get("callback_uri")).toBe(
    "http://127.0.0.1:1234/client",
  );
});

it("connect refusal stays public", async () => {
  await expect(denyConnect(connectForm())).rejects.toThrow("redirect");
  expect(fake.publicAction).toHaveBeenCalledOnce();
  expect(fake.authenticate).not.toHaveBeenCalled();
  const target = new URL(String(fake.redirect.mock.calls[0]?.[0]));
  expect(target.searchParams.get("error")).toBe("access_denied");
  expect(target.searchParams.get("state")).toBe("state");
});
