import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Each test re-imports `./send` after `vi.resetModules()`, so its
// once-per-process `announcedMissing` latch starts fresh and the mocks below
// are read with whatever values that test set.
const workerEnv: { EMAIL?: { send: ReturnType<typeof vi.fn> } } = {};
const appEnv = { DEPLOY_ENV: "development" };

vi.mock("cloudflare:workers", () => ({ env: workerEnv }));
vi.mock("~/env", () => ({ env: appEnv }));
vi.mock("@devdogsuga/email", () => ({
  render: () => ({ subject: "s", html: "<p>h</p>", text: "t" }),
}));

async function loadSend() {
  vi.resetModules();
  return import("./send");
}

describe("sendTemplate without an EMAIL binding", () => {
  beforeEach(() => {
    delete workerEnv.EMAIL;
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs at info, once, in development", async () => {
    appEnv.DEPLOY_ENV = "development";
    const { sendTemplate } = await loadSend();
    const send = sendTemplate as (...args: unknown[]) => Promise<unknown>;

    const result = await send("a@example.com", "teamInvite", {});
    await send("b@example.com", "teamInvite", {});

    expect(result).toMatchObject({ ok: false, reason: "not_configured" });
    expect(console.info).toHaveBeenCalledTimes(1);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it.each(["staging", "production"])(
    "warns, once, in a deployed %s Worker",
    async (tier) => {
      appEnv.DEPLOY_ENV = tier;
      const { sendTemplate } = await loadSend();
      const send = sendTemplate as (...args: unknown[]) => Promise<unknown>;

      await send("a@example.com", "teamInvite", {});
      await send("b@example.com", "teamInvite", {});

      expect(console.warn).toHaveBeenCalledTimes(1);
      expect(console.info).not.toHaveBeenCalled();
    },
  );
});

describe("sendTemplate with an EMAIL binding", () => {
  afterEach(() => {
    delete workerEnv.EMAIL;
  });

  it("classifies a suppressed recipient", async () => {
    workerEnv.EMAIL = {
      send: vi.fn().mockRejectedValue(new Error("E_RECIPIENT_SUPPRESSED")),
    };
    const { sendTemplate } = await loadSend();
    const send = sendTemplate as (...args: unknown[]) => Promise<unknown>;

    expect(await send("a@example.com", "teamInvite", {})).toMatchObject({
      ok: false,
      reason: "suppressed",
    });
  });
});
