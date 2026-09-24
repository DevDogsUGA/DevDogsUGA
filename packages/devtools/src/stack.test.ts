/**
 * `reconcileConfigAfterReset`: `db reset`'s best-effort trigger for the local
 * config reconcile route. Both `reachable` and `fetch` are injected (see
 * `ReconcileConfigDeps`) so these run with no real dev server and no
 * `vi.stubGlobal` on the network.
 */
import { describe, expect, it, vi } from "vitest";
import { reconcileConfigAfterReset } from "./stack.js";

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    ...init,
    headers: { "content-type": "application/json" },
  });
}

describe("reconcileConfigAfterReset", () => {
  it("reports the manual step when nothing is listening", async () => {
    const fetchSpy = vi.fn();
    const lines = await reconcileConfigAfterReset({
      reachable: vi.fn(async () => false),
      fetch: fetchSpy,
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(lines.join(" ")).toContain("nothing is listening");
    expect(lines.join(" ")).toContain("pnpm --filter platform dev");
  });

  it("requests the config-reconcile route with no auth header, and reports success", async () => {
    const fetchSpy = vi.fn<typeof globalThis.fetch>(async () =>
      jsonResponse({ success: true, counts: {} }),
    );
    const lines = await reconcileConfigAfterReset({
      reachable: vi.fn(async () => true),
      fetch: fetchSpy,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toBe("http://localhost:3000/cron/config-reconcile");
    // No CRON_SECRET, matching the route's own local-request exemption.
    expect(init).toBeUndefined();
    expect(lines).toEqual([
      "Meetings and workshops reconciled from @devdogsuga/events.",
    ]);
  });

  it("reports an aborted reconcile without pretending it succeeded", async () => {
    const fetchSpy = vi.fn(async () =>
      jsonResponse({ success: false, reason: "events has zero meetings" }),
    );
    const lines = await reconcileConfigAfterReset({
      reachable: vi.fn(async () => true),
      fetch: fetchSpy,
    });

    expect(lines.join(" ")).toContain("aborted");
    expect(lines.join(" ")).toContain("events has zero meetings");
  });

  it("reports a non-2xx response instead of throwing", async () => {
    const fetchSpy = vi.fn(async () => new Response("nope", { status: 500 }));
    const lines = await reconcileConfigAfterReset({
      reachable: vi.fn(async () => true),
      fetch: fetchSpy,
    });

    expect(lines.join(" ")).toContain("HTTP 500");
  });

  it("reports a network failure instead of rejecting", async () => {
    const fetchSpy = vi.fn(async () => {
      throw new Error("ECONNRESET");
    });
    const lines = await reconcileConfigAfterReset({
      reachable: vi.fn(async () => true),
      fetch: fetchSpy,
    });

    expect(lines.join(" ")).toContain("ECONNRESET");
  });
});
