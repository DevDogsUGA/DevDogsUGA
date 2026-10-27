// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import ConsentCard, { ConsentRefusedCard } from "./index";

vi.mock("~/server/actions/signOut", () => ({ default: vi.fn() }));

const FIELDS = ["Your DevDogs member ID", "Your email address"];

function render(
  overrides: Partial<Parameters<typeof ConsentCard>[0]> = {},
): string {
  return renderToStaticMarkup(
    <ConsentCard
      app={{
        label: "Dog Days",
        logoSrc: "https://api.example.org/logo.png",
        homepageUrl: "https://dogdays.dev",
        privacyPolicyUrl: "https://devdogsuga.org/legal/privacy",
        registrant: null,
      }}
      account={{ name: "Ada", email: "ada@uga.edu" }}
      fields={FIELDS}
      host="dogdays.supabase.co"
      authorizationId="auth-1"
      testing={false}
      {...overrides}
    >
      <button>Allow</button>
    </ConsentCard>,
  );
}

describe("ConsentCard", () => {
  it("shows a DevDogs app: logo, links, 'by DevDogs', account, fields, host", () => {
    const html = render();
    expect(html).toContain("Sign in to Dog Days");
    expect(html).toContain("by DevDogs");
    expect(html).toContain('src="https://api.example.org/logo.png"');
    expect(html).toContain('href="https://dogdays.dev"');
    expect(html).toContain('href="https://devdogsuga.org/legal/privacy"');
    expect(html).toContain("Ada");
    expect(html).toContain("ada@uga.edu");
    expect(html).toContain("Your email address");
    expect(html).toContain("dogdays.supabase.co");
  });

  it("names the member who registered a member's app", () => {
    expect(
      render({
        app: {
          label: "Lab",
          logoSrc: null,
          homepageUrl: null,
          privacyPolicyUrl: null,
          registrant: "Grace",
        },
      }),
    ).toContain("by Grace");
  });

  it("falls back to a letter tile and leaves out missing links", () => {
    const html = render({
      app: {
        label: "lab",
        logoSrc: null,
        homepageUrl: null,
        privacyPolicyUrl: null,
        registrant: "Grace",
      },
    });
    expect(html).not.toContain("<img");
    expect(html).toContain(">L</span>");
    expect(html).not.toContain("Website");
    expect(html).not.toContain("Privacy policy");
  });

  it("omits just the link that is missing", () => {
    const html = render({
      app: {
        label: "Lab",
        logoSrc: null,
        homepageUrl: "https://lab.dev",
        privacyPolicyUrl: null,
        registrant: "Grace",
      },
    });
    expect(html).toContain("Website");
    expect(html).not.toContain("Privacy policy");
  });

  it("sends 'Not you?' on a Testing app back to the picker", () => {
    const html = render({ testing: true });
    expect(html).toContain('href="/oauth/consent?authorization_id=auth-1"');
    expect(html).toContain("This app is in testing");
  });

  it("signs out on 'Not you?' in production, returning to this authorization", () => {
    const html = render({ testing: false });
    expect(html).toContain('name="callbackPath"');
    expect(html).toContain("/oauth/consent?authorization_id=auth-1");
    expect(html).not.toContain("This app is in testing");
  });

  it("renders registration text as text, not markup", () => {
    const html = render({
      app: {
        label: "<script>alert(1)</script>",
        logoSrc: null,
        homepageUrl: null,
        privacyPolicyUrl: null,
        registrant: "<b>x</b>",
      },
    });
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert(1)");
    expect(html).not.toContain("<b>x</b>");
  });
});

describe("ConsentRefusedCard", () => {
  it("says why a test account can't sign in to a production app", () => {
    const html = renderToStaticMarkup(
      <ConsentRefusedCard authorizationId="a b" />,
    );
    expect(html).toContain("test account");
    expect(html).toContain("production");
    expect(html).toContain("Sign out");
    expect(html).toContain("authorization_id=a%20b");
  });
});
