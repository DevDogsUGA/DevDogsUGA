import { describe, expect, it } from "vitest";
import { render, templateNames } from "./index.js";

/**
 * Tests against the COMPILED artifact, not the React sources.
 *
 * That is deliberate: the artifact is what ships, and every interesting
 * failure in this design — a sentinel left unsubstituted, a slot compiled in
 * the wrong order, a URL slot that lost its marker — exists only after the
 * compile step. Testing the components would test the half that never reaches
 * a Worker.
 */

const invite = {
  inviteeName: "Sam Rivera",
  teamName: "Bulldog Builders",
  competitionName: "Spring Sprint",
  leadName: "Alex Chen",
  acceptUrl: "https://devdogsuga.org/teams/abc/invite",
};

describe("render", () => {
  it("produces subject, html and text", () => {
    const email = render("TeamInvite", invite);

    expect(email.subject).toBe("Bulldog Builders invited you to compete");
    expect(email.html).toContain("Sam Rivera");
    expect(email.text).toContain("Sam Rivera");
  });

  it("never ships a text part that is empty", () => {
    // Some clients show only the text part, and its absence measurably worsens
    // spam scoring.
    for (const name of templateNames) {
      const email = render(name, {
        ...invite,
        applicantName: "Sam Rivera",
        reviewUrl: "https://devdogsuga.org/teams/abc/requests",
      } as never);
      expect(email.text.trim().length).toBeGreaterThan(40);
    }
  });

  it("leaves no sentinel behind in any output", () => {
    // The failure this design is most exposed to: a `⟦teamName⟧` in somebody's
    // inbox. It can only come from a slot the tokenizer failed to find, so it
    // is worth asserting on every template rather than on one.
    for (const name of templateNames) {
      const email = render(name, {
        ...invite,
        applicantName: "Sam Rivera",
        reviewUrl: "https://devdogsuga.org/teams/abc/requests",
      } as never);

      for (const part of [email.subject, email.html, email.text]) {
        expect(part).not.toContain("⟦");
        expect(part).not.toContain("⟧");
      }
    }
  });

  it("escapes a hostile team name in the html but not the subject", () => {
    const email = render("TeamInvite", {
      ...invite,
      teamName: '<script>alert("x")</script>',
    });

    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
    // The subject is a header, not markup — escaping it would put literal
    // `&amp;` in an inbox.
    expect(email.subject).toContain('<script>alert("x")</script>');
  });

  it("neutralises a javascript: accept url", () => {
    const email = render("TeamInvite", {
      ...invite,
      acceptUrl: "javascript:alert(1)",
    });

    expect(email.html).not.toContain("javascript:alert(1)");
    expect(email.html).toContain('href="#"');
  });

  it("puts the accept url in the html as a link", () => {
    const email = render("TeamInvite", invite);
    expect(email.html).toContain(`href="${invite.acceptUrl}"`);
  });

  it("carries the url into the text part too", () => {
    // A text-only client has no button to click, so the URL has to be legible
    // in the body rather than only in an href.
    const email = render("TeamInvite", invite);
    expect(email.text).toContain(invite.acceptUrl);
  });

  it("compiles both templates the design calls for", () => {
    expect([...templateNames].sort()).toEqual(["JoinRequest", "TeamInvite"]);
  });
});
