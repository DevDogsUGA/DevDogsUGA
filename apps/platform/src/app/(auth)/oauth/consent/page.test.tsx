// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("~/env", () => ({
  env: {
    NEXT_PUBLIC_SUPABASE_URL: "https://api.example.org",
    NEXT_PUBLIC_AVATARS_BUCKET: "avatars",
  },
}));
vi.mock("~/server/actions/signOut", () => ({ default: vi.fn() }));
vi.mock("~/server/actions/consent", () => ({
  allowConsent: vi.fn(),
  cancelConsent: vi.fn(),
}));
vi.mock("~/components/TestAccountDialog", () => ({ default: () => null }));

const headerValues = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  headers: async () => ({ get: (k: string) => headerValues.get(k) ?? null }),
}));

class Redirect extends Error {}
class NotFound extends Error {}
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Redirect(url), { url });
  },
  notFound: () => {
    throw new NotFound("not found");
  },
}));

const expectSession = vi.hoisted(() => vi.fn());
const expectUserWith = vi.hoisted(() => vi.fn());
vi.mock("~/server/auth", () => ({ expectSession, expectUserWith }));

const approveAs = vi.hoisted(() => vi.fn());
vi.mock("~/server/oauth/asAccount", () => ({ approveAs }));
const approveAuthorization = vi.hoisted(() => vi.fn());
vi.mock("~/server/oauth/approveAuthorization", () => ({
  approveAuthorization,
}));
vi.mock("~/supabase/server", () => ({
  createSupabaseServerClient: async () => ({}),
}));

const loadConsentRequest = vi.hoisted(() => vi.fn());
const resolveConsentAccount = vi.hoisted(() => vi.fn());
vi.mock("~/server/oauth/consentRequest", () => ({
  loadConsentRequest,
  resolveConsentAccount,
}));
const hasActiveConsent = vi.hoisted(() => vi.fn());
const findConsentTarget = vi.hoisted(() => vi.fn());
const findDisplayName = vi.hoisted(() => vi.fn());
vi.mock("~/server/oauth/consentTarget", () => ({
  findConsentTarget,
  hasActiveConsent,
  findDisplayName,
}));

import ConsentCard, { ConsentRefusedCard } from "~/components/ConsentCard";
import ConsentForm from "~/components/ConsentForm";
import ConsentPage from "./page";

interface CardProps {
  testing: boolean;
  host: string;
  app: {
    registrant: string | null;
    logoSrc: string | null;
    homepageUrl: string | null;
    privacyPolicyUrl: string | null;
  };
  account: { name: string; email: string | null };
  fields: string[];
  self: { userId: string };
  children: { type: unknown; props: CardProps };
}

const AUTH = "auth-1";
const ACCOUNT_ID = "11111111-1111-4111-8111-111111111111";

function target(overrides = {}) {
  return {
    clientId: "client-1",
    scope: "openid email profile",
    ownerUserId: "owner-1",
    status: "in_production",
    asksForConsent: true,
    redirectUri: "https://dogdays.supabase.co/auth/v1/callback",
    label: "Lab",
    logoPath: null,
    homepageUrl: null,
    privacyPolicyUrl: null,
    ...overrides,
  };
}

function props(extra: Record<string, string> = {}) {
  return {
    searchParams: Promise.resolve({ authorization_id: AUTH, ...extra }),
  };
}

async function run(extra?: Record<string, string>) {
  try {
    return await ConsentPage(props(extra));
  } catch (err) {
    if (err instanceof Redirect)
      return { redirect: (err as Redirect & { url: string }).url };
    if (err instanceof NotFound) return { notFound: true };
    throw err;
  }
}

const SELF = {
  actor: { kind: "self" },
  userId: "member-1",
  name: "Ada",
  email: "ada@uga.edu",
  isTestAccount: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  headerValues.clear();
  expectSession.mockResolvedValue("member-1");
  expectUserWith.mockResolvedValue({ email: "ada@uga.edu", testAccounts: [] });
  hasActiveConsent.mockResolvedValue(false);
  findConsentTarget.mockResolvedValue({});
  findDisplayName.mockResolvedValue("Grace");
  resolveConsentAccount.mockResolvedValue(SELF);
  loadConsentRequest.mockResolvedValue({
    target: target(),
    decision: "consent",
    userId: "member-1",
  });
});

describe("/oauth/consent", () => {
  it("404s without an authorization id and for an unknown one", async () => {
    await expect(
      ConsentPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toBeInstanceOf(NotFound);
    loadConsentRequest.mockResolvedValue(null);
    expect(await run()).toEqual({ notFound: true });
  });

  it("starts nothing on a prefetch", async () => {
    headerValues.set("next-router-prefetch", "1");
    expect(await run()).toBeNull();
    expect(loadConsentRequest).not.toHaveBeenCalled();
    expect(approveAuthorization).not.toHaveBeenCalled();
  });

  it.each([
    "next-router-segment-prefetch",
    "x-middleware-prefetch",
    "sec-purpose",
  ])("starts nothing on a prefetch signalled by %s", async (name) => {
    headerValues.set(name, name === "sec-purpose" ? "prefetch" : "1");
    expect(await run()).toBeNull();
    expect(loadConsentRequest).not.toHaveBeenCalled();
  });

  it("sends a signed-out visitor to sign in, then back here", async () => {
    expectSession.mockRejectedValue(new Error("no"));
    expect(await run()).toEqual({
      redirect: `/auth?callbackPath=${encodeURIComponent(`/oauth/consent?authorization_id=${AUTH}`)}`,
    });
  });

  it("skips the card for a DevDogs app that doesn't ask", async () => {
    loadConsentRequest.mockResolvedValue({
      target: target({ ownerUserId: null, asksForConsent: false }),
      decision: "auto-approve",
      userId: "member-1",
    });
    approveAuthorization.mockResolvedValue("https://app.example/cb?code=1");
    expect(await run()).toEqual({ redirect: "https://app.example/cb?code=1" });
  });

  it("shows a member's app to a member as the full card, by its owner", async () => {
    const element = (await run()) as {
      type: unknown;
      props: CardProps;
    };
    expect(element.type).toBe(ConsentCard);
    expect(element.props.testing).toBe(false);
    expect(element.props.host).toBe("dogdays.supabase.co");
    expect(element.props.app.registrant).toBe("Grace");
    expect(element.props.account).toEqual({
      name: "Ada",
      email: "ada@uga.edu",
    });
    expect(element.props.fields).toContain("Your email address");
  });

  it("calls a DevDogs app's registrant null so the card says 'by DevDogs'", async () => {
    loadConsentRequest.mockResolvedValue({
      target: target({ ownerUserId: null }),
      decision: "consent",
      userId: "member-1",
    });
    const element = (await run()) as { props: CardProps };
    expect(element.props.app.registrant).toBeNull();
  });

  it("builds the logo from our storage and leaves links off when absent", async () => {
    let element = (await run()) as { props: CardProps };
    expect(element.props.app.logoSrc).toBeNull();
    expect(element.props.app.homepageUrl).toBeNull();
    expect(element.props.app.privacyPolicyUrl).toBeNull();

    loadConsentRequest.mockResolvedValue({
      target: target({ logoPath: "apps/lab.png" }),
      decision: "consent",
      userId: "member-1",
    });
    element = (await run()) as { props: CardProps };
    expect(element.props.app.logoSrc).toBe(
      "https://api.example.org/storage/v1/object/public/avatars/apps/lab.png",
    );
  });

  it("ignores an account in the address on a production app", async () => {
    await run({ accountId: ACCOUNT_ID });
    expect(resolveConsentAccount).toHaveBeenCalledWith(expect.anything(), null);
  });

  it("goes straight back to the app when the member already approved it", async () => {
    hasActiveConsent.mockResolvedValue(true);
    approveAs.mockResolvedValue("https://app.example/cb?code=9");
    expect(await run()).toEqual({ redirect: "https://app.example/cb?code=9" });
    expect(approveAs).toHaveBeenCalledWith(SELF.actor, AUTH);
  });

  it("404s an unknown id before asking a signed-out visitor to sign in", async () => {
    findConsentTarget.mockResolvedValue(null);
    expectSession.mockRejectedValue(new Error("no session"));
    expect(await run()).toEqual({ notFound: true });
  });

  it("refuses a test identity on a production app with a message", async () => {
    loadConsentRequest.mockResolvedValue({
      target: target(),
      decision: "test-identity",
      userId: "member-1",
    });
    const element = (await run()) as { type: unknown };
    expect(element.type).toBe(ConsentRefusedCard);
  });

  describe("a Testing app", () => {
    beforeEach(() => {
      loadConsentRequest.mockResolvedValue({
        target: target({ status: "testing" }),
        decision: "pick-account",
        userId: "member-1",
      });
    });

    it("step one: with no pick it shows the account picker", async () => {
      resolveConsentAccount.mockImplementation(
        async (_r: unknown, id: string | null) => (id ? SELF : null),
      );
      const element = (await run()) as {
        type: unknown;
        props: CardProps;
      };
      // The picker sits in a wrapper card.
      const form = element.props.children;
      expect(form.type).toBe(ConsentForm);
      expect(form.props.self.userId).toBe("member-1");
    });

    it("step one again when the pick isn't one of the owner's accounts", async () => {
      resolveConsentAccount.mockImplementation(
        async (_r: unknown, id: string | null) =>
          id === "member-1" ? SELF : null,
      );
      const element = (await run({ accountId: ACCOUNT_ID })) as {
        props: CardProps;
      };
      expect((element.props.children as { type: unknown }).type).toBe(
        ConsentForm,
      );
    });

    it("step two: a picked account's first sign-in shows the card for it", async () => {
      resolveConsentAccount.mockResolvedValue({
        ...SELF,
        userId: ACCOUNT_ID,
        name: "Test Ada",
        isTestAccount: true,
      });
      const element = (await run({ accountId: ACCOUNT_ID })) as {
        type: unknown;
        props: CardProps;
      };
      expect(element.type).toBe(ConsentCard);
      expect(element.props.testing).toBe(true);
      expect(element.props.account.name).toBe("Test Ada");
    });

    it("skips step two once that account has approved", async () => {
      resolveConsentAccount.mockResolvedValue({ ...SELF, userId: ACCOUNT_ID });
      hasActiveConsent.mockResolvedValue(true);
      approveAs.mockResolvedValue("https://app.example/cb?code=7");
      expect(await run({ accountId: ACCOUNT_ID })).toEqual({
        redirect: "https://app.example/cb?code=7",
      });
    });
  });
});
