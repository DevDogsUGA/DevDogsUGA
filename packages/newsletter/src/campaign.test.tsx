import { describe, expect, it } from "vitest";
import { assertIssueReadyToSend } from "./campaign.js";
import { gdgcIssueByVersion } from "./gdgc-issues.js";
import { issueByVersion, ISSUES } from "./issues.js";
import {
  emailImages,
  previewRenderContext,
  renderIssueDocument,
} from "./export/index.js";
import { GDGC_DARK } from "./theme.js";

describe("Georgia 311 campaign", () => {
  it("leaves light surfaces free for Gmail to recolor", () => {
    const html = renderIssueDocument(gdgcIssueByVersion("1")!);
    const table = html.slice(html.indexOf('class="gdgc-email'));
    // Gmail drops the body <style>, so text colors must also ride inline.
    expect(table).toMatch(/class="tc-ffffff" style="[^"]*color:#ffffff/);
    expect(table).not.toContain("-webkit-text-fill-color");
    for (const color of [
      "#c3ecf6",
      "#ccf6c5",
      "#ffe7a5",
      "#f8d8d8",
      "#f0f0f0",
    ]) {
      expect(html).toContain(
        `.bc-${color.slice(1)}{background-color:${color}}`,
      );
      expect(html).not.toContain(`linear-gradient(${color},${color})`);
      expect(html).not.toContain(`box-shadow:inset 0 0 0 3000px ${color}`);
    }
  });

  it("swaps in the dark version under Outlook's dark-mode stamps", () => {
    const html = renderIssueDocument(gdgcIssueByVersion("1")!);
    // Outlook web matches prefers-color-scheme against the OS theme, so the
    // swap rides only Outlook's own dark-mode stamps.
    expect(html).not.toContain("prefers-color-scheme");
    for (const [property, swaps] of Object.entries({
      color: GDGC_DARK.color,
      "background-color": GDGC_DARK.background,
      "border-color": GDGC_DARK.border,
    })) {
      const prefix = {
        color: "tc",
        "background-color": "bc",
        "border-color": "brc",
      }[property];
      for (const [light, dark] of Object.entries(swaps)) {
        const rule = `.${prefix}-${light.slice(1)}{${property}:${dark} !important`;
        expect(html).toContain(`[data-ogsc] ${rule}`);
        expect(html).toContain(`[data-ogsb] ${rule}`);
      }
    }
    expect(html).toContain(
      `[data-ogsb] .bc-c3ecf6{background-color:${GDGC_DARK.background["#c3ecf6"]} !important;box-shadow:inset 0 0 0 3000px ${GDGC_DARK.background["#c3ecf6"]} !important}`,
    );
    // Light colors never pin to themselves: that fight is lost in Outlook.
    expect(html).not.toContain(".tc-1e1e1e{color:#1e1e1e !important");
    for (const scope of ["[data-ogsc] ", "[data-ogsb] "]) {
      expect(html).toContain(`${scope}.gdgc-light{display:none !important}`);
      expect(html).toContain(`${scope}.gdgc-dark{display:block !important}`);
    }
  });

  it("pairs each flat graphic with a hidden dark twin", () => {
    const html = renderIssueDocument(gdgcIssueByVersion("1")!);
    for (const name of ["header", "chapter", "devdogs"]) {
      expect(html).toMatch(
        new RegExp(`<img[^>]*campaign-${name}@[^>]*class="gdgc-light"`),
      );
      expect(html).toMatch(
        new RegExp(
          `<div class="gdgc-dark" style="display:none;mso-hide:all"><img[^>]*campaign-${name}-dark@`,
        ),
      );
    }
    const images = new Map(emailImages().map((image) => [image.cid, image]));
    const darkHeader = [...images.values()].find((image) =>
      image.filename.startsWith("campaign-header-dark"),
    )!;
    expect(darkHeader.rasterWidth).toBe(1200);
    expect(darkHeader.svg).toContain(
      `fill="${GDGC_DARK.background["#ffe7a5"]}"`,
    );
    expect(darkHeader.svg).not.toContain("#ffe7a5");
  });

  it("carries hosted and embedded Google Sans sources in the sent HTML", () => {
    const html = renderIssueDocument(gdgcIssueByVersion("1")!);
    const fonts = [
      ...html.matchAll(/data:font\/woff2;base64,([A-Za-z0-9+/=]+)/g),
    ];
    expect(fonts).toHaveLength(2);
    for (const weight of ["Regular", "Bold"]) {
      expect(html).toContain(
        `https://devdogsuga.org/brand/newsletter/GoogleSans-${weight}.ttf`,
      );
    }
    for (const match of fonts) {
      expect(Buffer.from(match[1]!, "base64").subarray(0, 4).toString()).toBe(
        "wOF2",
      );
    }
  });
  const issue = gdgcIssueByVersion("1")!;
  it("uses the meeting config for dates, rooms and duration", () => {
    expect(ISSUES.some((item) => item.campaign)).toBe(false);
    expect(issueByVersion("3.0.4")).toBeUndefined();
    expect(issue.featured).toHaveLength(3);
    for (const { meeting } of issue.featured) {
      expect(Date.parse(meeting.endsAt) - Date.parse(meeting.startsAt)).toBe(
        30 * 60_000,
      );
      expect(meeting.hasWorkshop).toBe(false);
    }
    const html = renderIssueDocument(issue, previewRenderContext());
    expect(html).toContain("Dawson 110");
    expect(html).toContain("DLW 124");
    expect(html).toContain("Virtual and recorded");
    expect(html).toContain("Builders and designers");
    expect(html).toContain("two-week civic hackathon");
    expect(html).toContain(
      "present their projects directly to Mableton city officials",
    );
    expect(html.indexOf("Choose a problem that matters")).toBeLessThan(
      html.indexOf("Join a 30-minute interest meeting</h2>"),
    );
    expect(html).toContain('href="mailto:devdogs@uga.edu"');
    // One DevDogs logo, shipped as a light/dark pair.
    expect(html.match(/alt="DevDogs"/g)).toHaveLength(2);
    expect(html).toMatch(/<img[^>]*alt="DevDogs"[^>]*class="gdgc-light"/);
    expect(html.indexOf('alt="DevDogs"')).toBeLessThan(
      html.indexOf("Keep building with DevDogs"),
    );
  });
  it("drops the past Oct 8 meeting from issue 2", () => {
    const html = renderIssueDocument(
      gdgcIssueByVersion("2")!,
      previewRenderContext(),
    );
    expect(html).not.toContain("Dawson 110");
    expect(html).toContain("DLW 124");
    expect(html).toContain("Both sessions cover");
    expect(html).toContain("Issue 2");
  });
  it("blocks sends with pending application or event links", () => {
    expect(() =>
      assertIssueReadyToSend({
        ...issue,
        campaign: {
          ...issue.campaign!,
          cta: { ...issue.campaign!.cta, url: "[GOOGLE FORM URL]" },
        },
      }),
    ).toThrow("Google Form application URL");
    const ready = {
      ...issue,
      campaign: {
        ...issue.campaign!,
        cta: {
          ...issue.campaign!.cta,
          url: "https://docs.google.com/forms/d/e/example/viewform",
        },
      },
      featured: issue.featured.map((f) => ({
        ...f,
        meeting: {
          ...f.meeting,
          rsvpUrl: "https://gdg.community.dev/events/example/",
        },
      })) as typeof issue.featured,
    };
    expect(() => assertIssueReadyToSend(ready)).not.toThrow();
    ready.featured[0].meeting.rsvpUrl = null;
    expect(() => assertIssueReadyToSend(ready)).toThrow("Bevy event URL");
    expect(() =>
      assertIssueReadyToSend(issueByVersion("3.0.3")!),
    ).not.toThrow();
  });
});
