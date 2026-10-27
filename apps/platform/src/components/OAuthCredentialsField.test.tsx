import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/settings/oauth",
}));
vi.mock("~/server/actions/oauth", () => ({ default: vi.fn() }));
vi.mock("~/components/Settings/OAuthClientSheet", () => ({
  default: () => null,
  MAX_REDIRECT_URIS: 5,
}));

const { NewAppButton } = await import("./OAuthCredentialsField");

afterEach(cleanup);

describe("NewAppButton", () => {
  it("links to the create page under the cap", () => {
    render(<NewAppButton hasGithub appCount={2} maxApps={3} />);
    expect(screen.getByRole("link", { name: /New OAuth app/ })).toHaveAttribute(
      "href",
      "/settings/oauth/new",
    );
  });

  it("disables at the cap and says why", () => {
    render(<NewAppButton hasGithub appCount={3} maxApps={3} />);
    const button = screen.getByRole("button", { name: /New OAuth app/ });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(
      "You own 3 apps, the most a member can. Delete one to create another.",
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("asks for GitHub first when none is linked", () => {
    render(<NewAppButton hasGithub={false} appCount={0} maxApps={3} />);
    expect(
      screen.getByRole("link", { name: "Link GitHub account" }),
    ).toHaveAttribute("href", "/settings/accounts#github");
  });
});
