import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  destinationOf,
  expandHome,
  namesEvents,
  parseGraphicsArgs,
  runGraphics,
  wantsEvents,
} from "./commands.js";
import { configEvents } from "./events.js";
import {
  assertUniqueStems,
  eventGraphics,
  staticGraphics,
  type Graphic,
} from "./registry.js";
import {
  commaList,
  formatsFor,
  matchGraphics,
  normalizeArgv,
  pair,
} from "./select.js";

const registry = staticGraphics();

const detail = { title: "Build night", date: "Sep 10, 2026", time: "6 PM" };

describe("the registry", () => {
  it("has the brand, app and event groups, and no page group", () => {
    const meetings = eventGraphics([
      { slug: "night", hint: "Sep 10, 2026", detail },
    ]);
    const groups = new Set([...registry, ...meetings].map((g) => g.group));
    expect([...groups].sort()).toEqual(["app", "brand", "event"]);
  });

  it("draws every graphic at every format it declares", async () => {
    // One cheap format per graphic: the templates run for real, the renderer
    // is not asked for the 1024px icons.
    for (const graphic of registry) {
      const { FORMATS } = await import("@devdogsuga/sdk/brand");
      const name = graphic.formats.find((n) => FORMATS[n]!.width <= 512)!;
      expect(() => graphic.render(FORMATS[name]!), graphic.name).not.toThrow();
    }
  });
});

describe("graphic patterns", () => {
  it("matches an exact name", () => {
    expect(
      matchGraphics(["app/dogdays"], registry).matched.map((g) => g.name),
    ).toEqual(["app/dogdays"]);
  });

  it("matches a whole group with a trailing star", () => {
    const { matched } = matchGraphics(["app/*"], registry);
    expect(matched.every((graphic) => graphic.group === "app")).toBe(true);
    expect(matched.length).toBeGreaterThan(1);
  });

  it("accepts a bare group as shorthand, because that is what people type", () => {
    expect(matchGraphics(["app"], registry).matched).toEqual(
      matchGraphics(["app/*"], registry).matched,
    );
  });

  it("matches everything for a lone star, and for a star over a star", () => {
    expect(matchGraphics(["*"], registry).matched).toHaveLength(
      registry.length,
    );
    expect(matchGraphics(["*/*"], registry).matched).toHaveLength(
      registry.length,
    );
  });

  it("reports a pattern that named nothing, including the dropped page group", () => {
    expect(matchGraphics(["page/home"], registry).unmatched).toEqual([
      "page/home",
    ]);
  });

  it("does not repeat a graphic named twice over", () => {
    const { matched } = matchGraphics(["app/*", "app/dogdays"], registry);
    expect(new Set(matched.map((g) => g.name)).size).toBe(matched.length);
  });
});

describe("multi-item meetings", () => {
  const items = [
    { stem: "workshop", detail: { ...detail, title: "React" } },
    { stem: "judging", detail: { ...detail, title: "DogPack" } },
  ];

  it("adds one graphic per agenda item while keeping the whole meeting", () => {
    const graphics = eventGraphics([
      { slug: "build-night", hint: "Sep 10, 2026", detail, items },
    ]);
    expect(graphics.map((graphic) => graphic.name)).toEqual([
      "event/build-night/meeting",
      "event/build-night/workshop",
      "event/build-night/judging",
    ]);
  });

  it("does not split a meeting with only one agenda item", () => {
    expect(
      eventGraphics([
        {
          slug: "workshop",
          hint: "Sep 10, 2026",
          detail,
          items: [items[0]!],
        },
      ]),
    ).toHaveLength(1);
  });

  it("numbers repeated agenda items so no two share a name", () => {
    const names = eventGraphics([
      {
        slug: "night",
        hint: "x",
        detail,
        items: [items[0]!, items[0]!],
      },
    ]).map((graphic) => graphic.name);
    expect(names).toEqual([
      "event/night/meeting",
      "event/night/workshop",
      "event/night/workshop-2",
    ]);
  });

  it("offers the Involvement Network export for meetings and agenda items", () => {
    const graphics = eventGraphics([
      { slug: "build-night", hint: "Sep 10, 2026", detail, items },
    ]);
    expect(
      graphics.every((graphic) =>
        graphic.formats.includes("involvement-network"),
      ),
    ).toBe(true);
  });

  it("offers the Instagram post and story for meetings and each workshop", () => {
    const graphics = eventGraphics([
      { slug: "build-night", hint: "Sep 10, 2026", detail, items },
    ]);
    expect(graphics.length).toBeGreaterThan(1);
    for (const graphic of graphics) {
      expect(graphic.formats).toContain("instagram-post");
      expect(graphic.formats).toContain("instagram-story");
    }
  });

  it("offers Instagram sizes to no brand or app graphic", () => {
    for (const graphic of registry) {
      expect(graphic.formats.some((f) => f.startsWith("instagram"))).toBe(
        false,
      );
    }
  });
});

describe("the real schedule", () => {
  it("reads the published meetings, newest first", async () => {
    const meetings = await configEvents().meetings();
    expect(meetings.length).toBeGreaterThan(0);
    const graphics = eventGraphics(meetings);
    expect(() => assertUniqueStems([...registry, ...graphics])).not.toThrow();
  });

  it("titles every poster with the resolved title, and carries category and brand", async () => {
    const meetings = await configEvents().meetings();
    const night = meetings.find((m) => m.slug === "2026-09-16")!;
    expect(night.detail.title).toBe("Build Session #1");
    expect(night.detail.category).toBe("build");
    expect(night.detail.brand).toBe("devdogs");
    const topic = meetings.find((m) => m.slug === "2026-11-04")!;
    expect(topic.detail.kicker).toBe("Workshop Wednesday");
  });
});

describe("the graphic x format matrix", () => {
  it("is sparse: savvycal belongs to the club lockup alone", () => {
    const supports = registry.filter((graphic) =>
      graphic.formats.includes("savvycal"),
    );
    expect(supports.map((graphic) => graphic.name)).toEqual(["brand/club"]);
  });

  /**
   * The rule the whole restructure was for: anything the club makes may end up
   * on the GDG on Campus platform, so everything has those two renditions.
   */
  it("gives every graphic both GDG renditions", () => {
    for (const graphic of registry) {
      expect(graphic.formats, graphic.name).toContain("gdgc-wide");
      expect(graphic.formats, graphic.name).toContain("gdgc-square");
    }
  });

  it("skips pairings that do not exist, and says which", () => {
    const club = registry.filter((graphic) => graphic.name === "brand/club");
    const { selections, unsupported } = pair(club, ["og", "icon-512"]);

    expect(selections.map((s) => s.format.name)).toEqual(["og"]);
    expect(unsupported).toEqual([
      { graphic: "brand/club", format: "icon-512" },
    ]);
  });

  it("offers only formats the chosen graphics support", () => {
    const names = formatsFor(
      registry.filter((graphic) => graphic.group === "brand"),
    ).map((format) => format.name);

    expect(names).toContain("og");
    expect(names).not.toContain("icon-512");
  });

  /** Output is flat, `<stem>-<format>.png`, so stems have to be unique. */
  it("keeps every leaf unique", () => {
    expect(() => assertUniqueStems(registry)).not.toThrow();
  });

  it("catches a duplicate leaf rather than overwriting one file with another", () => {
    const clash = [
      { name: "a/x", group: "a", stem: "x" },
      { name: "b/x", group: "b", stem: "x" },
    ] as Graphic[];

    expect(() => assertUniqueStems(clash)).toThrow(/share the leaf/);
  });

  it("never writes two selections to the same file", () => {
    const { selections } = pair(registry, [
      ...new Set(registry.flatMap((graphic) => graphic.formats)),
    ]);
    const files = selections.map((s) => destinationOf(s, "/out"));
    expect(new Set(files).size).toBe(files.length);
  });
});

describe("argument parsing", () => {
  it("splits --flag=value so the shared positional parser still works", () => {
    expect(
      normalizeArgv(["graphics", "--format=og,gdgc-wide", "app/dogdays"]),
    ).toEqual(["graphics", "--format", "og,gdgc-wide", "app/dogdays"]);
  });

  it("reads both spellings of --format the same way", () => {
    expect(parseGraphicsArgs(["--format=og,gdgc-wide"]).formats).toEqual([
      "og",
      "gdgc-wide",
    ]);
    expect(parseGraphicsArgs(["--format", "og,gdgc-wide"]).formats).toEqual([
      "og",
      "gdgc-wide",
    ]);
  });

  it("does not read a flag's value as a graphic name", () => {
    expect(
      parseGraphicsArgs(["--format", "og", "brand/club"]).patterns,
    ).toEqual(["brand/club"]);
  });

  it("has no --default-out: it was the one flag that wrote into DevDogsUGA paths", () => {
    expect("defaultOut" in parseGraphicsArgs(["--default-out"])).toBe(false);
  });

  it("trims and drops blanks in a comma list", () => {
    expect(commaList(" og , , gdgc-wide ")).toEqual(["og", "gdgc-wide"]);
  });

  it("expands a leading ~ the shell would have expanded unquoted", () => {
    expect(expandHome("~/images")).toMatch(/^\/.*\/images$/);
    expect(expandHome("./images")).toBe("./images");
    expect(expandHome("~images")).toBe("~images");
  });
});

describe("when the schedule is needed", () => {
  it("is needed for a wildcard, and with no pattern at all", () => {
    expect(wantsEvents(["*"])).toBe(true);
    expect(wantsEvents(["*/*"])).toBe(true);
    expect(wantsEvents([])).toBe(true);
  });

  it("is not needed for graphics that come out of the brand package", () => {
    expect(wantsEvents(["brand/*", "app/dogdays"])).toBe(false);
  });

  it("separates naming events from sweeping them up", () => {
    expect(namesEvents(["event/*"])).toBe(true);
    expect(namesEvents(["event/2026-09-08"])).toBe(true);
    expect(namesEvents(["*"])).toBe(false);
  });
});

describe("runGraphics", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "graphics-test-"));
    process.exitCode = undefined;
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    process.exitCode = undefined;
  });

  it("writes <stem>-<format>.png into the working directory with no --out", async () => {
    await runGraphics(["app/dogdays", "--format", "icon-32"], { cwd: dir });
    expect(await readdir(dir)).toEqual(["dogdays-icon-32.png"]);
    const png = await readFile(join(dir, "dogdays-icon-32.png"));
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    expect(process.exitCode).toBeUndefined();
  });

  it("writes into --out, creating it, flat", async () => {
    await runGraphics(
      ["brand/club", "--format", "email-1x", "--out", "nested/dir"],
      { cwd: dir },
    );
    expect(await readdir(join(dir, "nested", "dir"))).toEqual([
      "club-email-1x.png",
    ]);
  });

  it("renders an event card from a supplied schedule", async () => {
    await runGraphics(["event/night/meeting", "--format", "og"], {
      cwd: dir,
      reader: () => ({
        meetings: async () => [{ slug: "night", hint: "Sep 10", detail }],
      }),
    });
    expect(await readdir(dir)).toEqual(["night-og.png"]);
  });

  it("fails, writing nothing, for a graphic that does not exist", async () => {
    await runGraphics(["page/home", "--format", "og"], { cwd: dir });
    expect(process.exitCode).toBe(1);
    expect(await readdir(dir)).toEqual([]);
  });

  it("fails for a format the graphic does not support", async () => {
    await runGraphics(["brand/club", "--format", "icon-512"], { cwd: dir });
    expect(process.exitCode).toBe(1);
    expect(await readdir(dir)).toEqual([]);
  });

  it("writes nothing under --dry-run", async () => {
    await runGraphics(["app/dogdays", "--format", "icon-32", "--dry-run"], {
      cwd: dir,
    });
    expect(await readdir(dir)).toEqual([]);
  });

  it("skips an unreadable schedule under a wildcard, but fails when events were named", async () => {
    const reader = () => ({
      meetings: async () => {
        throw new Error("no schedule");
      },
    });
    await runGraphics(["brand/club", "event/*", "--format", "og"], {
      cwd: dir,
      reader,
    });
    expect(process.exitCode).toBe(1);
    process.exitCode = undefined;
    await runGraphics(["brand/*", "--format", "og", "--dry-run"], {
      cwd: dir,
      reader,
    });
    expect(process.exitCode).toBeUndefined();
  });
});
