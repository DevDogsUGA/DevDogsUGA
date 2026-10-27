// @vitest-environment node
import JSZip from "jszip";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { meetingSubjects } from "~/lib/graphics/subjects";

const caller = vi.hoisted(() => ({
  value: {
    isLeader: false,
    resolvedPermissions: { canManageAttendance: false },
  },
}));
const meetingLoader = vi.hoisted(() => vi.fn());
const drawn = vi.hoisted(() => ({ calls: 0 }));

vi.mock("~/server/actions/permissions", () => ({
  getCallerContext: async () => caller.value,
}));
// The real gate (`requirePermission`) bounces to sign-in or 404s; what matters
// here is that it runs the route's own predicate.
vi.mock("~/server/auth/require", () => ({
  requirePermission: async (check: (id: string) => Promise<boolean>) => {
    if (!(await check("officer-1"))) throw new Error("NOT_FOUND");
    return "officer-1";
  },
}));
vi.mock("~/server/graphics/meeting", () => ({
  getGraphicsMeeting: meetingLoader,
}));
// next/og cannot run under Node; draw a PNG signature plus the size asked for.
vi.mock("@devdogsuga/sdk/brand/next", () => ({
  imageResponse: (_: unknown, size: { width: number; height: number }) => {
    drawn.calls += 1;
    return new Response(
      Uint8Array.from([
        0x89,
        0x50,
        0x4e,
        0x47,
        ...new TextEncoder().encode(`${size.width}x${size.height}`),
      ]),
    );
  },
}));

import { GET as brand } from "../../app/(api)/console/graphics/brand/route";
import { GET as image } from "../../app/(api)/console/graphics/meetings/[meetingId]/image/route";
import { GET as zip } from "../../app/(api)/console/graphics/meetings/[meetingId]/zip/route";

const subjects = meetingSubjects({
  meeting: {
    slug: "2026-11-04",
    startsAt: new Date("2026-11-04T23:00:00Z"),
    endsAt: new Date("2026-11-05T01:00:00Z"),
    building: null,
    location: null,
    category: "workshop",
    cancelledAt: null,
    cancellationReason: null,
  },
  title: "Supabase II",
  workshops: [{ workshopId: "w1", title: "Auth", project: null }],
});

const ctx = { params: Promise.resolve({ meetingId: "m1" }) };
const url = (path: string) => `https://devdogsuga.org/console/graphics${path}`;

beforeEach(() => {
  caller.value = {
    isLeader: true,
    resolvedPermissions: { canManageAttendance: false },
  };
  drawn.calls = 0;
  meetingLoader.mockReset();
  meetingLoader.mockResolvedValue({
    id: "m1",
    slug: "2026-11-04",
    title: "Supabase II",
    subjects,
  });
});

describe("who may use the graphics routes", () => {
  it("lets an officer who cannot manage attendance in", async () => {
    const response = await image(
      new Request(url("/meetings/m1/image?subject=meeting&format=og")),
      ctx,
    );
    expect(response.status).toBe(200);
  });

  it("lets an attendance manager in", async () => {
    caller.value = {
      isLeader: false,
      resolvedPermissions: { canManageAttendance: true },
    };
    const response = await image(
      new Request(url("/meetings/m1/image?subject=meeting&format=og")),
      ctx,
    );
    expect(response.status).toBe(200);
  });

  it.each([
    [
      "image",
      () => image(new Request(url("/m?subject=meeting&format=og")), ctx),
    ],
    ["zip", () => zip(new Request(url("/m/zip?pick=meeting@og")), ctx)],
    [
      "brand",
      () => brand(new Request(url("/brand?graphic=brand/club&format=og"))),
    ],
  ])(
    "refuses a member with no officer role on %s, drawing nothing",
    async (_, call) => {
      caller.value = {
        isLeader: false,
        resolvedPermissions: { canManageAttendance: false },
      };
      await expect(call()).rejects.toThrow("NOT_FOUND");
      expect(drawn.calls).toBe(0);
      expect(meetingLoader).not.toHaveBeenCalled();
    },
  );
});

describe("GET image", () => {
  it("draws one graphic at the format's exact size, inline", async () => {
    const response = await image(
      new Request(
        url("/meetings/m1/image?subject=meeting&format=instagram-story"),
      ),
      ctx,
    );
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("content-disposition")).toBe(
      'inline; filename="2026-11-04-instagram-story.png"',
    );
    expect(
      Buffer.from(await response.arrayBuffer()).toString("latin1"),
    ).toContain("1080x1920");
  });

  it("downloads with ?download=1", async () => {
    const response = await image(
      new Request(
        url(
          "/meetings/m1/image?subject=workshop-w1&format=instagram-post&download=1",
        ),
      ),
      ctx,
    );
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="2026-11-04-auth-instagram-post.png"',
    );
  });

  it.each([
    ["an unknown size", "subject=meeting&format=nope"],
    ["a brand-only size", "subject=meeting&format=savvycal"],
    ["a size below the Worker's floor", "subject=meeting&format=icon-16"],
    ["an unknown subject", "subject=workshop-zzz&format=og"],
  ])("answers 400 for %s", async (_, query) => {
    const response = await image(
      new Request(url(`/meetings/m1/image?${query}`)),
      ctx,
    );
    expect(response.status).toBe(400);
    expect(drawn.calls).toBe(0);
  });
});

describe("GET zip", () => {
  async function unzip(response: Response) {
    return JSZip.loadAsync(Buffer.from(await response.arrayBuffer()), {
      checkCRC32: true,
    });
  }

  it("contains exactly the ticked graphics at the ticked sizes", async () => {
    const response = await zip(
      new Request(
        url(
          "/m/zip?pick=meeting@og&pick=meeting@instagram-post&pick=workshop-w1@instagram-story&pick=meeting@og",
        ),
      ),
      ctx,
    );
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="2026-11-04-graphics.zip"',
    );
    const archive = await unzip(response);
    expect(Object.keys(archive.files).sort()).toEqual([
      "2026-11-04-auth-instagram-story.png",
      "2026-11-04-instagram-post.png",
      "2026-11-04-og.png",
    ]);
    const story = await archive
      .file("2026-11-04-auth-instagram-story.png")!
      .async("string");
    expect(story).toContain("1080x1920");
    expect(drawn.calls).toBe(3);
  });

  it.each([
    ["nothing", ""],
    ["an unknown graphic", "pick=workshop-nope@og"],
    ["an unknown size", "pick=meeting@icon-512"],
    ["a malformed pick", "pick=meeting"],
  ])("answers 400 for %s before sending a byte", async (_, query) => {
    const response = await zip(new Request(url(`/m/zip?${query}`)), ctx);
    expect(response.status).toBe(400);
    expect(drawn.calls).toBe(0);
  });

  it("404s a meeting that does not exist", async () => {
    meetingLoader.mockResolvedValue(null);
    await expect(
      zip(new Request(url("/m/zip?pick=meeting@og")), ctx),
    ).rejects.toThrow();
  });
});

describe("GET brand", () => {
  it("draws a brand asset at a size it supports, as a download", async () => {
    const response = await brand(
      new Request(url("/brand?graphic=app/dogdays&format=icon-512&download=1")),
    );
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="dogdays-icon-512.png"',
    );
    expect(
      Buffer.from(await response.arrayBuffer()).toString("latin1"),
    ).toContain("512x512");
  });

  it.each([
    "graphic=nope&format=og",
    "graphic=brand/club&format=icon-512",
    "graphic=app/dogdays&format=icon-16",
  ])("answers 400 for %s", async (query) => {
    const response = await brand(new Request(url(`/brand?${query}`)));
    expect(response.status).toBe(400);
  });
});
