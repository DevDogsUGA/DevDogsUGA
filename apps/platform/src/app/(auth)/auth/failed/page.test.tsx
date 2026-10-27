// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));

import SignInProblemPage from "./page";

async function render(query: Record<string, string>) {
  return renderToStaticMarkup(
    await SignInProblemPage({ searchParams: Promise.resolve(query) }),
  );
}

describe("sign-in recovery page", () => {
  it("tells a wrong account to use a UGA account, with a retry that keeps the destination and no reference", async () => {
    const html = await render({
      reason: "wrong_account",
      returnTo: "/attendance/complete",
      ref: "SI-ABCDEFGH",
    });
    expect(html).toContain("Use your UGA account");
    expect(html).toContain(
      'href="/auth?callbackPath=%2Fattendance%2Fcomplete"',
    );
    expect(html).not.toContain("SI-ABCDEFGH");
  });

  it("says a cancellation changed nothing", async () => {
    const html = await render({ reason: "cancelled" });
    expect(html).toContain("Sign-in was cancelled");
    expect(html).toContain('href="/auth"');
    expect(html).not.toContain("Reference");
  });

  it("shows the reference for an unexpected failure", async () => {
    const html = await render({ reason: "unexpected", ref: "SI-ABCDEFGH" });
    expect(html).toContain("Reference SI-ABCDEFGH");
  });

  it("renders nothing a query supplied, and refuses an external return path", async () => {
    const html = await render({
      reason: "<script>alert(1)</script>",
      returnTo: "https://evil.example/",
      ref: "<img src=x onerror=alert(1)>",
      error_description: "raw provider text",
    });
    expect(html).not.toContain("script");
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("evil.example");
    expect(html).not.toContain("raw provider text");
    expect(html).not.toContain("Reference");
  });
});
