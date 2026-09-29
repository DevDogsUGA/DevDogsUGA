import { describe, expect, it, vi } from "vitest";
import { createSharedCache, type CacheStore } from "./sharedCache";

/** An in-memory stand-in for `caches.default`: one data center's cache. */
function fakeStore(): CacheStore & { size: () => number } {
  const entries = new Map<string, Response>();
  return {
    match: (request) =>
      Promise.resolve(entries.get(request.url)?.clone() ?? undefined),
    put: (request, response) => {
      entries.set(request.url, response);
      return Promise.resolve();
    },
    delete: (request) => Promise.resolve(entries.delete(request.url)),
    size: () => entries.size,
  };
}

describe("createSharedCache", () => {
  it("loads once and serves repeats from memory until the TTL passes", async () => {
    let time = 0;
    const cache = createSharedCache({ store: null, now: () => time });
    const load = vi.fn(() => Promise.resolve({ n: 1 }));

    await cache.get("k", 5000, load);
    time = 4999;
    await cache.get("k", 5000, load);
    expect(load).toHaveBeenCalledTimes(1);

    time = 5000;
    await cache.get("k", 5000, load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("shares a value between isolates through the data-center store", async () => {
    const store = fakeStore();
    const time = 0;
    const isolateA = createSharedCache({ store, now: () => time });
    const isolateB = createSharedCache({ store, now: () => time });
    const load = vi.fn(() => Promise.resolve(["thread"]));

    await isolateA.get("k", 5000, load);
    const fromB = await isolateB.get("k", 5000, load);

    expect(fromB).toEqual(["thread"]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("ignores a store entry past its millisecond expiry", async () => {
    const store = fakeStore();
    let time = 0;
    const isolateA = createSharedCache({ store, now: () => time });
    const isolateB = createSharedCache({ store, now: () => time });
    await isolateA.get("k", 5000, () => Promise.resolve("old"));

    time = 5001;
    const value = await isolateB.get("k", 5000, () => Promise.resolve("new"));
    expect(value).toBe("new");
  });

  it("evict clears memory and the store, so a writer sees its own write", async () => {
    const store = fakeStore();
    const cache = createSharedCache({ store, now: () => 0 });
    await cache.get("k", 5000, () => Promise.resolve("before"));

    await cache.evict("k");
    expect(store.size()).toBe(0);
    expect(await cache.get("k", 5000, () => Promise.resolve("after"))).toBe(
      "after",
    );
  });

  it("still answers when the store fails", async () => {
    const broken: CacheStore = {
      match: () => Promise.reject(new Error("down")),
      put: () => Promise.reject(new Error("down")),
      delete: () => Promise.reject(new Error("down")),
    };
    const cache = createSharedCache({ store: broken, now: () => 0 });
    expect(await cache.get("k", 5000, () => Promise.resolve(42))).toBe(42);
  });
});
