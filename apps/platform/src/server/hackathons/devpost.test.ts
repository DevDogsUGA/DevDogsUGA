// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEVPOST_ENDPOINT,
  fetchDevpostPage,
  parseDevpostPage,
  parseDateLabel,
  type DevpostPage,
} from "./devpost";
import fixture from "./fixtures/devpost-page1.json";

type Item = Record<string, unknown>;
const items = fixture.hackathons as Item[];
const envelope = (hackathons: unknown[], total = hackathons.length) => ({
  hackathons,
  meta: { total_count: total },
});
const ok = (body: unknown): DevpostPage => {
  const result = parseDevpostPage(body);
  if (!result.ok) throw new Error(`unexpected failure: ${result.message}`);
  return result.data;
};
const without = (item: Item, key: string) => {
  const copy = { ...item };
  delete copy[key];
  return copy;
};

describe("the recorded Devpost page", () => {
  it("maps every item to a table row", () => {
    const page = ok(fixture);
    expect(page.items).toHaveLength(9);
    expect(page.totalCount).toBe(80);
    expect(page.dropped).toBe(0);
    expect(page.skipped).toBe(0);
    expect(page.idless).toBe(0);
    expect(page.ids).toEqual(items.map((i) => i.id));
    expect(page.items[0]).toEqual({
      devpostId: 31302,
      name: "PayPal AI Hackathon",
      url: "https://paypalaihackathon.devpost.com/",
      location: "Online",
      openState: "open",
      dateLabel: "Oct 01 - Nov 12, 2026",
      startsOn: "2026-10-01",
      endsOn: "2026-11-12",
    });
  });

  it("parses every label the feed used", () => {
    for (const item of ok(fixture).items) {
      expect(item.startsOn, item.name).not.toBeNull();
      expect(item.endsOn, item.name).not.toBeNull();
    }
  });
});

describe("drift in the feed", () => {
  it.each(["id", "title", "url", "open_state", "displayed_location"])(
    "drops an item missing %s, and keeps its neighbours",
    (key) => {
      const page = ok(envelope([without(items[0]!, key), items[1]]));
      expect(page.dropped).toBe(1);
      expect(page.items.map((i) => i.devpostId)).toEqual([items[1]!.id]);
    },
  );

  it("drops an item whose field changed type", () => {
    const page = ok(
      envelope([
        { ...items[0], id: "31302" },
        { ...items[1], title: 7 },
        { ...items[2], displayed_location: "Online" },
        items[3],
      ]),
    );
    expect(page.dropped).toBe(3);
    expect(page.items.map((i) => i.devpostId)).toEqual([items[3]!.id]);
  });

  it("counts an item with no usable id as idless, so the sync can tell", () => {
    const page = ok(envelope([without(items[0]!, "id"), items[1]]));
    expect(page.idless).toBe(1);
    expect(page.ids).toEqual([items[1]!.id]);
  });

  it("tolerates a missing or null date label and keeps the item", () => {
    const page = ok(
      envelope([
        without(items[0]!, "submission_period_dates"),
        { ...items[1], submission_period_dates: null },
      ]),
    );
    expect(page.items).toHaveLength(2);
    for (const item of page.items) {
      expect(item.dateLabel).toBeNull();
      expect(item.startsOn).toBeNull();
    }
  });

  it("keeps an unparseable date label as given and invents no dates", () => {
    for (const label of [
      "Soon!",
      "Oct 01 - Nov 12",
      "1 Oct - 12 Nov 2026",
      "Oct 01 - Dec 05",
    ]) {
      const [item] = ok(
        envelope([{ ...items[0], submission_period_dates: label }]),
      ).items;
      expect(item!.dateLabel).toBe(label);
      expect([item!.startsOn, item!.endsOn]).toEqual([null, null]);
    }
  });

  it("ignores fields it does not know", () => {
    const page = ok(envelope([{ ...items[0], brand_new: { nested: true } }]));
    expect(page.items).toHaveLength(1);
  });

  it("drops an unusable title or link", () => {
    const page = ok(
      envelope([
        { ...items[0], title: " x " },
        { ...items[1], url: "javascript:alert(1)" },
        { ...items[2], url: "" },
        items[3],
      ]),
    );
    expect(page.dropped).toBe(3);
    expect(page.items).toHaveLength(1);
  });

  it("fails as a changed schema when every item on a page is unreadable", () => {
    const result = parseDevpostPage(
      envelope(items.map((item) => without(item, "open_state"))),
    );
    expect(result).toMatchObject({ ok: false, kind: "shape" });
  });

  it("treats an honestly empty page as ok", () => {
    const page = ok(envelope([], 0));
    expect(page.items).toEqual([]);
    expect(page.ids).toEqual([]);
  });

  it.each([
    ["null", null],
    ["a list", []],
    ["no hackathons", { meta: { total_count: 1 } }],
    ["no meta", { hackathons: [] }],
    ["a string total", { hackathons: [], meta: { total_count: "80" } }],
    ["a negative total", { hackathons: [], meta: { total_count: -1 } }],
    ["hackathons as an object", { hackathons: {}, meta: { total_count: 0 } }],
  ])("fails shape on %s", (_name, body) => {
    expect(parseDevpostPage(body)).toMatchObject({ ok: false, kind: "shape" });
  });
});

describe("what is skipped, not dropped", () => {
  it("re-checks the filters locally", () => {
    const page = ok(
      envelope([
        { ...items[0], displayed_location: { location: "Atlanta, GA" } },
        { ...items[1], open_state: "ended" },
        items[2],
      ]),
    );
    expect(page.skipped).toBe(2);
    expect(page.dropped).toBe(0);
    expect(page.items.map((i) => i.devpostId)).toEqual([items[2]!.id]);
  });

  it("reads online from the globe icon or the word, and nothing else", () => {
    const page = ok(
      envelope([
        {
          ...items[0],
          displayed_location: { icon: "globe", location: "Anywhere" },
        },
        { ...items[1], displayed_location: { location: "Online Worldwide" } },
        {
          ...items[2],
          displayed_location: { icon: "pin", location: "Onlinetown, GA" },
        },
      ]),
    );
    expect(page.items.map((i) => i.devpostId)).toEqual([
      items[0]!.id,
      items[1]!.id,
    ]);
    expect(page.skipped).toBe(1);
  });

  it("accepts upcoming as well as open", () => {
    const [item] = ok(
      envelope([{ ...items[0], open_state: "upcoming" }]),
    ).items;
    expect(item!.openState).toBe("upcoming");
  });
});

describe("canonical links and bounded text", () => {
  it("stores the link in canonical form", () => {
    const [item] = ok(
      envelope([
        { ...items[0], url: "http://PayPalAI.devpost.com?utm_source=x#a" },
      ]),
    ).items;
    expect(item!.url).toBe("https://paypalai.devpost.com/");
  });

  it("collapses whitespace and bounds the name, location and label", () => {
    const [item] = ok(
      envelope([
        {
          ...items[0],
          title: `  A   ${"b".repeat(400)}  `,
          displayed_location: { icon: "globe", location: "O".repeat(500) },
          submission_period_dates: "Q".repeat(500),
        },
      ]),
    ).items;
    expect(item!.name.length).toBeLessThanOrEqual(200);
    expect(item!.name.startsWith("A b")).toBe(true);
    expect(item!.location).toHaveLength(200);
    expect(item!.dateLabel).toHaveLength(200);
  });
});

describe("parseDateLabel", () => {
  it.each([
    ["Oct 01 - Nov 12, 2026", ["2026-10-01", "2026-11-12"]],
    ["Nov 02 - 04, 2026", ["2026-11-02", "2026-11-04"]],
    ["Dec 28, 2026 - Jan 05, 2027", ["2026-12-28", "2027-01-05"]],
    ["Nov 02, 2026", ["2026-11-02", "2026-11-02"]],
    ["  Oct 01  -  Nov 12, 2026 ", ["2026-10-01", "2026-11-12"]],
    ["oct 01 - nov 12, 2026", ["2026-10-01", "2026-11-12"]],
  ])("reads %j", (label, expected) => {
    expect(parseDateLabel(label)).toEqual(expected);
  });

  it.each([
    "",
    "TBA",
    "Oct 01 - Nov 12",
    "Dec 28 - Jan 05, 2027",
    "Feb 30 - Mar 02, 2026",
    "Nov 12 - 02, 2026",
    "Foo 01 - Bar 02, 2026",
    "Okt 01 - Nov 12, 2026",
    "Nov 12, 2026 - Nov 02, 2026",
    "Oct 01 - Nov 12, 2026 (EST)",
  ])("gives no dates for %j", (label) => {
    expect(parseDateLabel(label)).toEqual([null, null]);
  });

  it("gives no dates for nothing", () => {
    expect(parseDateLabel(null)).toEqual([null, null]);
    expect(parseDateLabel(undefined)).toEqual([null, null]);
  });
});

describe("fetchDevpostPage", () => {
  afterEach(() => vi.useRealTimers());
  const json = (body: unknown, init?: ResponseInit) =>
    new Response(JSON.stringify(body), init);

  it("asks for online, open and upcoming events by page, and says who is asking", async () => {
    const fetch = vi.fn(async () => json(fixture));
    const result = await fetchDevpostPage(3, { fetch });
    expect(result.ok).toBe(true);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url.startsWith(`${DEVPOST_ENDPOINT}?`)).toBe(true);
    expect(url).toContain("challenge_type[]=online");
    expect(url).toContain("status[]=open");
    expect(url).toContain("status[]=upcoming");
    expect(url).toContain("page=3");
    expect(JSON.stringify(init.headers)).toContain("DevDogsUGA-platform");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("types a 429 as rate and carries Retry-After in seconds", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-01T12:00:00Z"));
    const fetch = vi.fn(
      async () =>
        new Response("slow down", {
          status: 429,
          headers: { "retry-after": "120" },
        }),
    );
    const result = await fetchDevpostPage(1, { fetch });
    expect(result).toMatchObject({ ok: false, kind: "rate" });
    expect(!result.ok && result.retryAt?.toISOString()).toBe(
      "2026-11-01T12:02:00.000Z",
    );
  });

  it("types a 429 with an HTTP-date Retry-After, and ignores a garbled one", async () => {
    const date = "Sun, 01 Nov 2026 12:30:00 GMT";
    const dated = await fetchDevpostPage(1, {
      fetch: async () =>
        new Response("", { status: 429, headers: { "retry-after": date } }),
    });
    expect(!dated.ok && dated.retryAt?.toISOString()).toBe(
      "2026-11-01T12:30:00.000Z",
    );
    const garbled = await fetchDevpostPage(1, {
      fetch: async () =>
        new Response("", { status: 429, headers: { "retry-after": "soon" } }),
    });
    expect(garbled).toMatchObject({
      ok: false,
      kind: "rate",
      retryAt: undefined,
    });
  });

  it("types a 403 as rate too, and other statuses as http", async () => {
    expect(
      await fetchDevpostPage(1, {
        fetch: async () => new Response("", { status: 403 }),
      }),
    ).toMatchObject({ ok: false, kind: "rate" });
    expect(
      await fetchDevpostPage(1, {
        fetch: async () => new Response("", { status: 500 }),
      }),
    ).toMatchObject({ ok: false, kind: "http" });
  });

  it("types a network error and a timeout as network", async () => {
    expect(
      await fetchDevpostPage(1, {
        fetch: async () => {
          throw new TypeError("fetch failed");
        },
      }),
    ).toMatchObject({ ok: false, kind: "network", message: "fetch failed" });
    expect(
      await fetchDevpostPage(1, {
        timeoutMs: 5,
        fetch: (_url, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () =>
              reject(new Error("aborted")),
            );
          }),
      }),
    ).toMatchObject({ ok: false, kind: "network" });
  });

  it("refuses a body past the limit, by header or by reading", async () => {
    const big = "x".repeat(2000);
    expect(
      await fetchDevpostPage(1, {
        maxBytes: 1000,
        fetch: async () =>
          new Response(big, {
            headers: { "content-length": String(big.length) },
          }),
      }),
    ).toMatchObject({ ok: false, kind: "size" });
    // No Content-Length: a chunked body is cut off as it is read.
    const chunks = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < 4; i += 1)
          controller.enqueue(new TextEncoder().encode(big.slice(0, 500)));
        controller.close();
      },
    });
    expect(
      await fetchDevpostPage(1, {
        maxBytes: 1000,
        fetch: async () => new Response(chunks),
      }),
    ).toMatchObject({ ok: false, kind: "size" });
  });

  it("accepts a body exactly at the limit", async () => {
    const body = JSON.stringify(envelope([], 0));
    const result = await fetchDevpostPage(1, {
      maxBytes: body.length,
      fetch: async () => new Response(body),
    });
    expect(result.ok).toBe(true);
  });

  it("types a body that is not JSON, or not the envelope, as shape", async () => {
    expect(
      await fetchDevpostPage(1, { fetch: async () => new Response("<html>") }),
    ).toMatchObject({ ok: false, kind: "shape" });
    expect(
      await fetchDevpostPage(1, {
        fetch: async () => json({ challenges: [] }),
      }),
    ).toMatchObject({ ok: false, kind: "shape" });
  });
});
