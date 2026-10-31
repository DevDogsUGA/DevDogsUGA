import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Who may edit an app's details and upload its logo, and where the logo may be
 * written. The database and Storage are replaced: what is pinned here is the
 * gate, the validation and the single path a logo can have.
 */

const APP = "11111111-1111-4111-8111-111111111111";
const OWNER = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const HOLDER = "44444444-4444-4444-8444-444444444444";
const OTHER_APP = "55555555-5555-4555-8555-555555555555";
const LOGO_VERSION = "66666666-6666-4666-8666-666666666666";

const mocks = vi.hoisted(() => ({
  session: "",
  holders: new Set<string>(),
  app: null as null | {
    userId: string | null;
    status: "testing" | "in_production";
    label: string;
    homepageUrl?: string | null;
    privacyPolicyUrl?: string | null;
  },
  objectExists: true,
  updates: [] as Record<string, unknown>[],
  audits: [] as Record<string, unknown>[],
  signedPaths: [] as string[],
}));

vi.mock("~/env", () => ({ env: { NEXT_PUBLIC_AVATARS_BUCKET: "avatars" } }));
vi.mock("../auth", () => ({
  expectSession: () => Promise.resolve(mocks.session),
}));
vi.mock("~/server/auth/permissions", () => ({
  getCallerContext: async (id: string) => ({
    resolvedPermissions: { canManageOAuthApps: mocks.holders.has(id) },
    isLeader: false,
    minRank: Infinity,
  }),
}));
vi.mock("~/supabase/admin", () => ({
  supabaseAdmin: {
    storage: {
      from: (bucket: string) => ({
        createSignedUploadUrl: (path: string) => {
          expect(bucket).toBe("avatars");
          mocks.signedPaths.push(path);
          return Promise.resolve({ data: { token: "tok" }, error: null });
        },
        exists: () =>
          Promise.resolve({ data: mocks.objectExists, error: null }),
      }),
    },
  },
}));
vi.mock("../db", () => {
  const tx = {
    update: () => ({
      set: (values: Record<string, unknown>) => {
        mocks.updates.push(values);
        return { where: () => Promise.resolve() };
      },
    }),
    insert: () => ({
      values: (row: Record<string, unknown>) => {
        mocks.audits.push(row);
        return Promise.resolve();
      },
    }),
  };
  return {
    db: {
      query: {
        oauthRegistrations: {
          findFirst: () =>
            Promise.resolve(
              mocks.app ? { clientId: APP, ...mocks.app } : undefined,
            ),
        },
      },
      transaction: (fn: (t: typeof tx) => Promise<void>) => fn(tx),
    },
  };
});
vi.mock("../oauth/appStatus", () => ({
  APP_NOT_FOUND: "OAuth client not found",
}));

const { saveAppDetails, saveAppLogo, createAppLogoUploadToken } =
  await import("./oauthApps");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session = OWNER;
  mocks.holders = new Set([HOLDER]);
  mocks.app = { userId: OWNER, status: "testing", label: "Lab" };
  mocks.objectExists = true;
  mocks.updates.length = 0;
  mocks.audits.length = 0;
  mocks.signedPaths.length = 0;
});

describe("saveAppDetails", () => {
  it("saves an owner's https links without an audit entry while in Testing", async () => {
    const result = await saveAppDetails(APP, {
      homepageUrl: "https://lab.example.com",
      privacyPolicyUrl: "https://lab.example.com/privacy",
    });
    expect(result).toEqual({ ok: true });
    expect(mocks.updates).toEqual([
      {
        homepageUrl: "https://lab.example.com",
        privacyPolicyUrl: "https://lab.example.com/privacy",
      },
    ]);
    expect(mocks.audits).toEqual([]);
  });

  it("saves one link and leaves the other as it is", async () => {
    mocks.app = {
      userId: OWNER,
      status: "testing",
      label: "Lab",
      homepageUrl: "https://lab.example.com",
      privacyPolicyUrl: null,
    };
    const result = await saveAppDetails(APP, {
      privacyPolicyUrl: "https://lab.example.com/privacy",
    });
    expect(result).toEqual({ ok: true });
    expect(mocks.updates).toEqual([
      { privacyPolicyUrl: "https://lab.example.com/privacy" },
    ]);
  });

  it("accepts blank links in Testing and stores them as unset", async () => {
    await saveAppDetails(APP, { homepageUrl: "", privacyPolicyUrl: " " });
    expect(mocks.updates).toEqual([
      { homepageUrl: null, privacyPolicyUrl: null },
    ]);
  });

  it("validates https on save and names the field", async () => {
    const result = await saveAppDetails(APP, {
      homepageUrl: "http://lab.example.com",
      privacyPolicyUrl: "",
    });
    expect(result).toMatchObject({
      ok: false,
      message: expect.stringMatching(/^Homepage must be/) as unknown,
      fieldErrors: {
        homepageUrl: expect.stringMatching(/^Homepage must be/) as unknown,
      },
    });
    expect(mocks.updates).toEqual([]);
  });

  it("refuses every change to a member's published app, blank or not", async () => {
    mocks.app = { userId: OWNER, status: "in_production", label: "Lab" };
    for (const input of [
      { homepageUrl: "https://lab.example.com", privacyPolicyUrl: "" },
      {
        homepageUrl: "https://new.example.com",
        privacyPolicyUrl: "https://lab.example.com/p",
      },
    ]) {
      const result = await saveAppDetails(APP, input);
      expect(result).toMatchObject({
        ok: false,
        message: expect.stringMatching(
          /locked while an app is in production.*return it to Testing/,
        ) as unknown,
      });
    }
    expect(mocks.updates).toEqual([]);
    expect(mocks.audits).toEqual([]);
  });

  it("refuses to clear a published DevDogs app's links", async () => {
    mocks.app = { userId: null, status: "in_production", label: "DogDays" };
    mocks.session = HOLDER;
    const result = await saveAppDetails(APP, {
      homepageUrl: "",
      privacyPolicyUrl: "https://dogdays.dev/p",
    });
    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { homepageUrl: expect.any(String) as unknown },
    });
    expect(mocks.updates).toEqual([]);
  });

  it("audits a holder's change to a published DevDogs app", async () => {
    mocks.app = { userId: null, status: "in_production", label: "DogDays" };
    mocks.session = HOLDER;
    await saveAppDetails(APP, {
      homepageUrl: "https://dogdays.dev",
      privacyPolicyUrl: "https://dogdays.dev/p",
    });
    expect(mocks.audits).toHaveLength(1);
    expect(mocks.audits[0]).toMatchObject({
      action: "oauth_app.details_changed",
      actorUserId: HOLDER,
      targetId: APP,
    });
  });

  it("is not found for a member who does not own the app", async () => {
    mocks.session = OTHER;
    await expect(
      saveAppDetails(APP, { homepageUrl: "", privacyPolicyUrl: "" }),
    ).rejects.toThrow("OAuth client not found");
    expect(mocks.updates).toEqual([]);
  });

  it("lets only a holder edit a DevDogs app", async () => {
    mocks.app = { userId: null, status: "in_production", label: "DogDays" };
    mocks.session = OWNER;
    await expect(
      saveAppDetails(APP, { homepageUrl: "", privacyPolicyUrl: "" }),
    ).rejects.toThrow("OAuth client not found");

    mocks.session = HOLDER;
    await expect(
      saveAppDetails(APP, {
        homepageUrl: "https://dogdays.dev",
        privacyPolicyUrl: "https://devdogsuga.org/legal/privacy",
      }),
    ).resolves.toEqual({ ok: true });
    expect(mocks.audits).toHaveLength(1);
  });

  it("is not found for an app that does not exist or a malformed id", async () => {
    mocks.app = null;
    await expect(
      saveAppDetails(APP, { homepageUrl: "", privacyPolicyUrl: "" }),
    ).rejects.toThrow("OAuth client not found");
    await expect(
      saveAppDetails("nope", { homepageUrl: "", privacyPolicyUrl: "" }),
    ).rejects.toThrow("OAuth client not found");
  });
});

describe("logo upload", () => {
  it("signs each upload to a fresh path in the app's folder", async () => {
    const result = await createAppLogoUploadToken(APP);
    const again = await createAppLogoUploadToken(APP);
    expect(result.path).toMatch(
      new RegExp(`^apps/${APP}/[0-9a-f-]{36}\\.webp$`),
    );
    expect(again.path).not.toBe(result.path);
    expect(mocks.signedPaths).toEqual([result.path, again.path]);
    expect(result.maxBytes).toBe(256 * 1024);
  });

  it("signs nothing for a member who does not own the app", async () => {
    mocks.session = OTHER;
    await expect(createAppLogoUploadToken(APP)).rejects.toThrow(
      "OAuth client not found",
    );
    expect(mocks.signedPaths).toEqual([]);
  });

  it("records the path only after the object exists", async () => {
    const path = `apps/${APP}/${LOGO_VERSION}.webp`;
    mocks.objectExists = false;
    const missing = await saveAppLogo(APP, path);
    expect(missing.ok).toBe(false);
    expect(mocks.updates).toEqual([]);

    mocks.objectExists = true;
    await expect(saveAppLogo(APP, path)).resolves.toEqual({ ok: true });
    expect(mocks.updates).toEqual([{ logoPath: path }]);
  });

  it("records only a path in this app's own folder", async () => {
    for (const path of [
      `apps/${APP}.webp`,
      `apps/${OTHER_APP}/${LOGO_VERSION}.webp`,
      `${OWNER}.webp`,
    ]) {
      expect(await saveAppLogo(APP, path)).toMatchObject({ ok: false });
    }
    expect(mocks.updates).toEqual([]);
  });

  it("refuses a logo token and a logo save while the owner's app is published", async () => {
    mocks.app = { userId: OWNER, status: "in_production", label: "Lab" };
    await expect(createAppLogoUploadToken(APP)).rejects.toThrow(
      /locked while an app is in production/,
    );
    expect(mocks.signedPaths).toEqual([]);
    const saved = await saveAppLogo(APP, `apps/${APP}/${LOGO_VERSION}.webp`);
    expect(saved).toMatchObject({ ok: false });
    expect(mocks.updates).toEqual([]);
  });

  it("allows both again in Testing", async () => {
    mocks.app = { userId: OWNER, status: "testing", label: "Lab" };
    const { path } = await createAppLogoUploadToken(APP);
    await expect(saveAppLogo(APP, path)).resolves.toEqual({ ok: true });
  });
});
