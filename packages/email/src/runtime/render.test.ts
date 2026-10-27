import { describe, expect, it } from "vitest";
import { render, templateNames } from "./index.js";

/**
 * Tests the COMPILED artifact, not the React sources.
 *
 * The artifact is what ships, and every interesting failure in this design
 * exists only after the compile step: a sentinel left unsubstituted, a slot
 * compiled in the wrong order, a URL slot that lost its marker. Testing the
 * components would test the half that never reaches a Worker.
 */

const invite = {
  inviteeName: "Sam Rivera",
  teamName: "Bulldog Builders",
  leadName: "Alex Chen",
  acceptUrl: "https://devdogsuga.org/teams/abc/invite",
};

const deletion = {
  name: "Sam Rivera",
  requestedLine: "You asked to delete your account.",
  scheduledDate: "Friday, November 6, 2026",
  keepUrl: "https://devdogsuga.org/account/deletion",
};

describe("render", () => {
  it("produces subject, html and text", () => {
    const email = render("TeamInvite", invite);

    expect(email.subject).toBe("Bulldog Builders invited you to join");
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
        competitionName: "Spring Sprint",
        reviewUrl: "https://devdogsuga.org/teams/abc/requests",
        ...deletion,
      } as never);
      expect(email.text.trim().length).toBeGreaterThan(40);
    }
  });

  it("leaves no sentinel behind in any output", () => {
    // A `⟦teamName⟧` in somebody's inbox is what this design is most exposed
    // to. It can only come from a slot the tokenizer failed to find, so assert
    // on every template rather than on one.
    for (const name of templateNames) {
      const email = render(name, {
        ...invite,
        applicantName: "Sam Rivera",
        competitionName: "Spring Sprint",
        reviewUrl: "https://devdogsuga.org/teams/abc/requests",
        ...deletion,
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
    // The subject is a header, not markup. Escaping it would put a literal
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

  it("compiles every template", () => {
    expect([...templateNames].sort()).toEqual([
      "AccountDeletionComplete",
      "AccountDeletionScheduled",
      "JoinRequest",
      "TeamInvite",
    ]);
  });

  it("tells the member when the account goes and how to keep it", () => {
    const email = render("AccountDeletionScheduled", deletion);

    expect(email.subject).toBe(
      "Your DevDogs account will be deleted on Friday, November 6, 2026",
    );
    expect(email.html).toContain("Friday, November 6, 2026");
    expect(email.html).toContain("You asked to delete your account.");
    expect(email.html).toContain(`href="${deletion.keepUrl}"`);
    expect(email.html).toContain("Keep my account");
    expect(email.text).toContain(deletion.keepUrl);
    expect(email.text).toContain("Friday, November 6, 2026");
  });

  it("escapes the member's name in the deletion emails", () => {
    const hostile = { ...deletion, name: "<b>Sam</b>" };
    const scheduled = render("AccountDeletionScheduled", hostile);
    const complete = render("AccountDeletionComplete", hostile);

    expect(scheduled.html).not.toContain("<b>Sam</b>");
    expect(scheduled.html).toContain("&lt;b&gt;Sam&lt;/b&gt;");
    expect(complete.html).toContain("&lt;b&gt;Sam&lt;/b&gt;");
  });

  it("says the deletion is done, with nothing to click", () => {
    const email = render("AccountDeletionComplete", deletion);

    expect(email.subject).toBe("Your DevDogs account has been deleted");
    expect(email.html).toContain("permanently deleted");
    expect(email.html).not.toContain("Keep my account");
  });
});
