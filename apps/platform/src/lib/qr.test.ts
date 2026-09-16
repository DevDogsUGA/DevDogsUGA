import { describe, expect, it } from "vitest";
import { QR_DEFAULTS, qrVersionIssue, renderQrSvg } from "./qr";

describe("QR renderer", () => {
  it("reproduces the reference dimensions and centered logo box", () => {
    const svg = renderQrSvg(
      "https://devdogsuga.org/attendance",
      QR_DEFAULTS,
      "data:image/svg+xml;base64,AA==",
    );
    expect(svg).toContain('width="999" height="999" viewBox="0 0 999 999"');
    expect(svg).toContain('width="243" height="243" x="378" y="378"');
    expect(svg).not.toContain('<rect width="999"');
  });

  it("sizes the logo in modules", () => {
    const svg = renderQrSvg(
      "https://devdogsuga.org/attendance",
      { ...QR_DEFAULTS, logoSize: 7 },
      "data:image/svg+xml;base64,AA==",
    );
    expect(svg).toContain('width="189" height="189" x="405" y="405"');
    expect(() =>
      renderQrSvg("hello", { ...QR_DEFAULTS, logoSize: 1.5 }),
    ).toThrow("whole number of modules");
  });

  it("rejects invalid values and escapes SVG attributes", () => {
    expect(() => renderQrSvg("", QR_DEFAULTS)).toThrow("Enter something");
    expect(
      renderQrSvg("hello", { ...QR_DEFAULTS, color: 'red\" onload=\"x' }),
    ).toContain('fill="red&quot; onload=&quot;x"');
  });

  it("renders square modules and standard finder patterns", () => {
    const svg = renderQrSvg("hello", {
      ...QR_DEFAULTS,
      shape: "square",
    });
    expect(svg).toContain('<rect width="6" height="6"></rect>');
    expect(svg).not.toContain("M4.5,14h5.1C12");
  });

  it("renders a two-color brand gradient", () => {
    const svg = renderQrSvg("hello", {
      ...QR_DEFAULTS,
      gradient: ["#cb0027", "#00a4ad"],
    });
    expect(svg).toContain('<linearGradient id="qr-gradient"');
    expect(svg).toContain('stop-color="#cb0027"');
    expect(svg).toContain('fill="url(#qr-gradient)"');
  });

  it("reports content and logo constraints for explicit versions", () => {
    expect(qrVersionIssue("x".repeat(500), "H", 1, 9, 0, true)).toContain(
      "Content does not fit",
    );
    expect(qrVersionIssue("hello", "L", 1, 9, 0, true)).toContain(
      "error-correction budget",
    );
    expect(qrVersionIssue("hello", "H", 1, 3, 0, true)).toBeUndefined();
  });
});
