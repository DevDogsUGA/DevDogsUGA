import { describe, expect, it } from "vitest";
import {
  cardLayout,
  EVENT_FORMATS,
  FORMATS,
  INSTAGRAM_POST_SIZE,
  INSTAGRAM_STORY_SIZE,
} from "./formats.js";
import { workshopCardDetail, type EventDetail } from "./event.js";
import { brandGraphics, staticBrandGraphics } from "./graphics.js";
import { render } from "./render.js";
import { cardContext } from "./templates/CardShell.js";
import { EventCard } from "./templates/EventCard.js";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

const night: EventDetail = {
  title: "Workshop Wednesday",
  date: "Nov 4, 2026",
  time: "6:00 PM – 8:00 PM",
  location: "Boyd Graduate Studies 328",
  category: "workshop",
  kicker: "Weekly",
  agenda: [
    "Workshop: Supabase II",
    "Workshop: Auth in practice",
    "Workshop: Row level security",
    "Workshop: Realtime",
    "Workshop: Edge functions",
    "Workshop: Storage",
    "Workshop: Postgres tips",
  ],
  path: "/events/2026-11-04-workshop-wednesday",
};

describe("Instagram formats", () => {
  it("are 4:5 and 9:16 at 1080px wide, and cards", () => {
    expect(FORMATS["instagram-post"]).toMatchObject({
      ...INSTAGRAM_POST_SIZE,
      scale: 1,
      family: "card",
    });
    expect(FORMATS["instagram-story"]).toMatchObject({
      ...INSTAGRAM_STORY_SIZE,
      scale: 1,
      family: "card",
    });
    expect(INSTAGRAM_POST_SIZE.width / INSTAGRAM_POST_SIZE.height).toBe(0.8);
    expect(
      INSTAGRAM_STORY_SIZE.width / INSTAGRAM_STORY_SIZE.height,
    ).toBeCloseTo(9 / 16, 3);
  });

  it("lay out as the tall card, which no other size does", () => {
    expect(cardLayout(1080, 1350)).toBe("tall");
    expect(cardLayout(1080, 1920)).toBe("tall");
    expect(cardLayout(1080, 1080)).toBe("square");
    expect(cardLayout(1200, 630)).toBe("standard");
    expect(cardLayout(2560, 650)).toBe("wide");
  });

  it("measure the same type scale on the post and the story", () => {
    expect(cardContext(1080, 1350)).toEqual(cardContext(1080, 1920));
    expect(cardContext(1080, 1920)).toMatchInlineSnapshot(`
      {
        "contentWidth": 904,
        "layout": "tall",
        "u": 1,
      }
    `);
  });

  it("are offered for a whole night and for a workshop alike", () => {
    expect(EVENT_FORMATS).toEqual([
      "og",
      "gdgc-wide",
      "gdgc-square",
      "involvement-network",
      "instagram-post",
      "instagram-story",
    ]);
    for (const name of EVENT_FORMATS) expect(FORMATS[name]).toBeDefined();
  });

  it.each([
    ["night", night],
    ["workshop", workshopCardDetail(night, "Supabase II")],
    [
      "cancelled night",
      { ...night, agenda: undefined, cancelled: { reason: "Weather" } },
    ],
    [
      "long title",
      {
        ...night,
        title:
          "Presentations and Judging for the Fall Build Sprint Showcase Finals",
      },
    ],
  ] as const)("render a %s at the exact pixel size", async (_, detail) => {
    for (const name of ["instagram-post", "instagram-story"] as const) {
      const format = FORMATS[name]!;
      const out = await render(
        EventCard({
          width: format.width,
          height: format.height,
          cobrand: true,
          ...detail,
        }),
        { width: format.width, height: format.height },
      );
      expect(out.png.subarray(0, 4)).toEqual(PNG);
      expect([out.width, out.height]).toEqual([format.width, format.height]);
    }
  });
});

describe("workshopCardDetail", () => {
  it("keeps the night's date and room, drops the agenda and badges Workshop", () => {
    const card = workshopCardDetail(night, "Supabase II");
    expect(card).toMatchObject({
      title: "Supabase II",
      date: night.date,
      time: night.time,
      location: night.location,
      agenda: undefined,
      badge: { label: "Workshop" },
    });
  });
});

describe("brand graphics", () => {
  it("are unique by stem and keep the GDG renditions", () => {
    const all = staticBrandGraphics();
    expect(new Set(all.map((g) => g.stem)).size).toBe(all.length);
    for (const g of brandGraphics()) expect(g.formats).toContain("gdgc-wide");
  });
});
