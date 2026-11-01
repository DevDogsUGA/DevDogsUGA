import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OAuthClientPage as ClientPage } from "~/server/loaders/oauthClient";

const CLIENT = "11111111-1111-4111-8111-111111111111";

const mocks = vi.hoisted(() => ({
  requireDashboard: vi.fn(),
  getOAuthClientPage: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("~/server/auth/access", () => ({
  requireDashboard: mocks.requireDashboard,
}));
vi.mock("~/server/loaders/oauthClient", () => ({
  getOAuthClientPage: mocks.getOAuthClientPage,
}));
vi.mock("~/components/Settings/OAuthClientDetails", () => ({
  default: ({ client }: { client: { label: string } }) => (
    <div>details for {client.label}</div>
  ),
}));

const { default: OAuthClientPage } = await import("./page");

function page(over: Partial<ClientPage> = {}): ClientPage {
  return {
    client: {
      clientId: CLIENT,
      label: "Lab",
      status: "testing",
      redirectUris: ["http://127.0.0.1:3000/auth"],
      logoUrl: null,
      homepageUrl: null,
      privacyPolicyUrl: null,
      approvedTestAccountIds: [],
    },
    devDogsApp: false,
    testAccounts: [],
    moderation: {} as ClientPage["moderation"],
    ...over,
  };
}

const params = Promise.resolve({ clientId: CLIENT });

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireDashboard.mockResolvedValue({ userId: "owner" });
});

describe("/dashboard/oauth/[clientId]", () => {
  it("renders the owner's client under a back link to their apps", async () => {
    mocks.getOAuthClientPage.mockResolvedValue(page());
    render(await OAuthClientPage({ params }));
    expect(mocks.getOAuthClientPage).toHaveBeenCalledExactlyOnceWith(CLIENT);
    expect(screen.getByRole("heading", { name: "Lab" })).toBeInTheDocument();
    expect(screen.getByText("Testing")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "OAuth apps" })).toHaveAttribute(
      "href",
      "/dashboard/oauth",
    );
    expect(screen.getByText("details for Lab")).toBeInTheDocument();
  });

  it("sends a holder editing a DevDogs app back to Console → Apps", async () => {
    mocks.getOAuthClientPage.mockResolvedValue(page({ devDogsApp: true }));
    render(await OAuthClientPage({ params }));
    expect(screen.getByRole("link", { name: "Apps" })).toHaveAttribute(
      "href",
      "/dashboard/apps",
    );
  });

  it("is a 404 for a client the caller may not manage, whether or not it exists", async () => {
    mocks.getOAuthClientPage.mockResolvedValue(null);
    await expect(OAuthClientPage({ params })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("asks the loader nothing for a signed-out visitor", async () => {
    mocks.requireDashboard.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(OAuthClientPage({ params })).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.getOAuthClientPage).not.toHaveBeenCalled();
  });
});
