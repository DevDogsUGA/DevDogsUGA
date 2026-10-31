import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExpectedFailure } from "~/lib/actionResult";

/**
 * The owner's OAuth client Commands: create, delete, regenerate the secret and
 * add or remove a redirect URI. Each returns an ActionResult; GoTrue refusing
 * a change still throws. The database, GoTrue and the domain steps are
 * replaced; `oauth.db-test.ts` runs the real ones.
 */

const USER = "11111111-1111-4111-8111-111111111111";
const CLIENT = "22222222-2222-4222-8222-222222222222";

const mocks = vi.hoisted(() => ({
  signedIn: true,
  githubIdentity: null as { id: number } | null,
  registration: null as null | {
    clientId: string;
    userId: string | null;
    status: string;
    label: string;
  },
  mayManage: true,
  redirectUris: ["https://a.example/cb"],
  gotrue: {
    updateClient: vi.fn(),
    regenerateClientSecret: vi.fn(),
    getClient: vi.fn(),
  },
  create: vi.fn(),
  deleteClient: vi.fn(),
  cleanUp: vi.fn(),
  audits: [] as unknown[],
  authenticate: vi.fn(),
}));

vi.mock("~/server/auth/access", () => ({
  authorizeSession: () =>
    Promise.resolve(
      mocks.signedIn
        ? { ok: true, caller: { userId: USER } }
        : { ok: false, message: "Session expected but not found." },
    ),
  callerFor: () => Promise.resolve({}),
}));
vi.mock("../auth", () => ({
  authenticate: (...args: unknown[]) => {
    mocks.authenticate(...args);
    return Promise.reject(new Error("redirect:/auth"));
  },
  expectUserWith: () =>
    Promise.resolve({ id: USER, githubIdentity: mocks.githubIdentity }),
}));
vi.mock("../db", () => {
  const tx = {
    insert: () => ({
      values: (value: unknown) => {
        mocks.audits.push(value);
        return Promise.resolve();
      },
    }),
    delete: () => ({ where: () => Promise.resolve() }),
  };
  return {
    db: {
      query: {
        oauthRegistrations: {
          findFirst: async () => mocks.registration ?? undefined,
        },
      },
      transaction: async (work: (t: typeof tx) => Promise<unknown>) => work(tx),
    },
  };
});
vi.mock("../db/schema", () => ({ auditEvents: {}, oauthRegistrations: {} }));
vi.mock("../../supabase/admin", () => ({
  supabaseAdmin: { auth: { admin: { oauth: mocks.gotrue } } },
}));
vi.mock("../oauth/appStatus", () => ({
  revokeAppAccess: async () => ({
    consents: 0,
    sessions: 0,
    authorizations: 0,
  }),
}));
vi.mock("../oauth/audit", () => ({ oauthAuditEvent: (e: unknown) => e }));
vi.mock("../oauth/managedClient", () => ({
  mayManageClient: () => mocks.mayManage,
}));
vi.mock("../oauth/ownedClients", () => ({
  cleanUpTestAccountsIfNoClientsRemain: mocks.cleanUp,
  deleteSupabaseClient: mocks.deleteClient,
}));
vi.mock("../oauth/registerClient", () => ({
  createOauthClientAndRegister: mocks.create,
}));

const {
  createOAuthClient,
  deleteOAuthClient,
  regenerateOAuthSecret,
  addRedirectUri,
  removeRedirectUri,
} = await import("./oauth");

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.signedIn = true;
  mocks.githubIdentity = { id: 1 };
  mocks.registration = {
    clientId: CLIENT,
    userId: USER,
    status: "testing",
    label: "Lab",
  };
  mocks.mayManage = true;
  mocks.redirectUris = ["https://a.example/cb"];
  mocks.audits = [];
  mocks.create.mockResolvedValue({ clientId: CLIENT, clientSecret: "s3cret" });
  mocks.gotrue.getClient.mockImplementation(() =>
    Promise.resolve({
      data: { redirect_uris: mocks.redirectUris },
      error: null,
    }),
  );
  mocks.gotrue.updateClient.mockResolvedValue({ error: null });
  mocks.gotrue.regenerateClientSecret.mockResolvedValue({
    data: { client_secret: "fresh" },
    error: null,
  });
});

describe("every Command", () => {
  it("sends a signed-out visitor to sign in", async () => {
    mocks.signedIn = false;
    await expect(deleteOAuthClient(CLIENT)).rejects.toThrow("redirect:/auth");
    await expect(createOAuthClient(form({ label: "x" }))).rejects.toThrow(
      "redirect:/auth",
    );
    expect(mocks.authenticate).toHaveBeenCalledWith(
      "google",
      "/dashboard/oauth",
    );
  });

  it("answers a client the member may not manage with 'not found', never which ids are real", async () => {
    mocks.mayManage = false;
    for (const result of [
      await deleteOAuthClient(CLIENT),
      await regenerateOAuthSecret(CLIENT),
      await addRedirectUri(CLIENT, "https://b.example/cb"),
      await removeRedirectUri(CLIENT, "https://a.example/cb"),
    ]) {
      expect(result).toEqual({ ok: false, message: "OAuth client not found" });
    }
    mocks.registration = null;
    expect(await deleteOAuthClient(CLIENT)).toEqual({
      ok: false,
      message: "OAuth client not found",
    });
    expect(mocks.deleteClient).not.toHaveBeenCalled();
    expect(mocks.gotrue.updateClient).not.toHaveBeenCalled();
  });
});

describe("createOAuthClient", () => {
  it("creates a Testing app and returns its id and one-time secret", async () => {
    expect(await createOAuthClient(form({ label: " Lab " }))).toEqual({
      ok: true,
      data: { clientId: CLIENT, clientSecret: "s3cret" },
      message: "Created Lab.",
    });
    expect(mocks.create).toHaveBeenCalledWith({
      label: "Lab",
      redirectUris: ["http://localhost:3000/auth"],
      userId: USER,
    });
  });

  it("passes a typed callback address through to the redirect rule", async () => {
    await createOAuthClient(
      form({ label: "Lab", callbackUri: "https://lab.example/cb" }),
    );
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ redirectUris: ["https://lab.example/cb"] }),
    );
  });

  it("refuses a missing or too long label, and no GitHub account", async () => {
    expect(await createOAuthClient(form({ label: " " }))).toEqual({
      ok: false,
      message: "Label is required",
    });
    expect(await createOAuthClient(form({ label: "x".repeat(101) }))).toEqual({
      ok: false,
      message: "Label must be 100 characters or fewer",
    });
    mocks.githubIdentity = null;
    expect(await createOAuthClient(form({ label: "Lab" }))).toMatchObject({
      ok: false,
      message: expect.stringMatching(/GitHub/) as unknown,
    });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("returns the app cap and a rejected address as failures", async () => {
    mocks.create.mockRejectedValueOnce(
      new ExpectedFailure("You can own at most 3 OAuth apps."),
    );
    expect(await createOAuthClient(form({ label: "Lab" }))).toEqual({
      ok: false,
      message: "You can own at most 3 OAuth apps.",
    });
  });

  it("lets a real failure throw", async () => {
    mocks.create.mockRejectedValueOnce(new Error("Failed to create"));
    await expect(createOAuthClient(form({ label: "Lab" }))).rejects.toThrow(
      "Failed to create",
    );
  });
});

describe("deleteOAuthClient", () => {
  it("deletes a Testing app with no audit entry, then tidies the test accounts", async () => {
    expect(await deleteOAuthClient(CLIENT)).toEqual({
      ok: true,
      message: "App deleted.",
    });
    expect(mocks.deleteClient).toHaveBeenCalledWith(CLIENT);
    expect(mocks.cleanUp).toHaveBeenCalledWith(USER);
    expect(mocks.audits).toEqual([]);
  });

  it("audits the deletion of a published app", async () => {
    mocks.registration!.status = "in_production";
    await deleteOAuthClient(CLIENT);
    expect(mocks.audits).toEqual([
      expect.objectContaining({
        action: "oauth_client.deleted",
        clientId: CLIENT,
      }),
    ]);
  });
});

describe("regenerateOAuthSecret", () => {
  it("returns the new secret once", async () => {
    expect(await regenerateOAuthSecret(CLIENT)).toEqual({
      ok: true,
      data: { clientSecret: "fresh" },
      message: "Secret regenerated.",
    });
    expect(mocks.audits).toEqual([]);
  });

  it("audits a published app's rotation, without the secret", async () => {
    mocks.registration!.userId = null;
    await regenerateOAuthSecret(CLIENT);
    expect(JSON.stringify(mocks.audits)).toContain("secret_rotated");
    expect(JSON.stringify(mocks.audits)).not.toContain("fresh");
  });

  it("lets GoTrue refusing the roll throw, not come back as a refusal", async () => {
    mocks.gotrue.regenerateClientSecret.mockResolvedValue({
      data: null,
      error: { message: "boom" },
    });
    await expect(regenerateOAuthSecret(CLIENT)).rejects.toThrow(/boom/);
  });
});

describe("addRedirectUri", () => {
  it("adds an address and says so", async () => {
    expect(await addRedirectUri(CLIENT, " https://b.example/cb ")).toEqual({
      ok: true,
      message: "Redirect URI added.",
    });
    expect(mocks.gotrue.updateClient).toHaveBeenCalledWith(CLIENT, {
      redirect_uris: ["https://a.example/cb", "https://b.example/cb"],
    });
  });

  it("leaves an address that is already there alone", async () => {
    expect(await addRedirectUri(CLIENT, "https://a.example/cb")).toMatchObject({
      ok: true,
    });
    expect(mocks.gotrue.updateClient).not.toHaveBeenCalled();
  });

  it("refuses an address the redirect rule refuses", async () => {
    expect(await addRedirectUri(CLIENT, "http://example.com/cb")).toMatchObject(
      {
        ok: false,
        message: expect.stringMatching(/Redirect URIs must be/) as unknown,
      },
    );
    expect(mocks.gotrue.updateClient).not.toHaveBeenCalled();
  });

  it("refuses a sixth address", async () => {
    mocks.redirectUris = [1, 2, 3, 4, 5].map((n) => `https://${n}.example/cb`);
    expect(await addRedirectUri(CLIENT, "https://6.example/cb")).toEqual({
      ok: false,
      message: "A maximum of 5 redirect URIs are allowed",
    });
  });

  it("lets GoTrue refusing the update throw", async () => {
    mocks.gotrue.updateClient.mockResolvedValue({ error: { message: "boom" } });
    await expect(
      addRedirectUri(CLIENT, "https://b.example/cb"),
    ).rejects.toThrow(/boom/);
  });
});

describe("removeRedirectUri", () => {
  it("removes an address and says so", async () => {
    mocks.redirectUris = ["https://a.example/cb", "https://b.example/cb"];
    expect(await removeRedirectUri(CLIENT, "https://b.example/cb")).toEqual({
      ok: true,
      message: "Redirect URI removed.",
    });
    expect(mocks.gotrue.updateClient).toHaveBeenCalledWith(CLIENT, {
      redirect_uris: ["https://a.example/cb"],
    });
  });

  it("refuses to remove the last address", async () => {
    expect(await removeRedirectUri(CLIENT, "https://a.example/cb")).toEqual({
      ok: false,
      message: "An app needs at least one redirect URI",
    });
    expect(mocks.gotrue.updateClient).not.toHaveBeenCalled();
  });
});
