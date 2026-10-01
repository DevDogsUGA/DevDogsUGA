import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AttendanceBannerClient from "./AttendanceBannerClient";
import {
  DISMISSED_ATTRIBUTE,
  dismiss,
  dismissalKey,
  dismissalScript,
  isDismissed,
} from "./dismissal";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

/** Runs the script the way the browser does: as inline script in the document. */
function runScript(source: string) {
  const script = document.createElement("script");
  script.textContent = source;
  document.head.append(script);
  script.remove();
}

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  document.documentElement.removeAttribute(DISMISSED_ATTRIBUTE);
  vi.restoreAllMocks();
});

describe("dismissal", () => {
  it("is scoped to the meeting", () => {
    dismiss("scoped-a");
    expect(isDismissed("scoped-a")).toBe(true);
    expect(isDismissed("scoped-b")).toBe(false);
    expect(sessionStorage.getItem(dismissalKey("scoped-a"))).toBe("dismissed");
  });

  it("reads a dismissal written by an earlier page load", () => {
    sessionStorage.setItem(dismissalKey("earlier"), "dismissed");
    expect(isDismissed("earlier")).toBe(true);
  });

  it("stays dismissed for the page's lifetime when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(isDismissed("no-storage")).toBe(false);
    expect(() => dismiss("no-storage")).not.toThrow();
    expect(isDismissed("no-storage")).toBe(true);
  });
});

describe("dismissalScript", () => {
  it("stamps <html> when this meeting was dismissed", () => {
    sessionStorage.setItem(dismissalKey("m1"), "dismissed");
    runScript(dismissalScript("m1"));
    expect(document.documentElement.getAttribute(DISMISSED_ATTRIBUTE)).toBe(
      "dismissed",
    );
  });

  it("leaves <html> alone for a different meeting", () => {
    sessionStorage.setItem(dismissalKey("other"), "dismissed");
    runScript(dismissalScript("m2"));
    expect(document.documentElement.hasAttribute(DISMISSED_ATTRIBUTE)).toBe(
      false,
    );
  });

  it("swallows a storage failure", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(() => runScript(dismissalScript("m3"))).not.toThrow();
  });
});

describe("AttendanceBannerClient", () => {
  it("renders on first paint when not dismissed, then goes away on dismiss", () => {
    render(<AttendanceBannerClient meetingId="live-1" title="General body" />);
    expect(screen.getByText("Check in now")).toBeTruthy();

    act(() => {
      screen.getByRole("button", { name: /dismiss/i }).click();
    });
    expect(screen.queryByText("Check in now")).toBeNull();
  });

  it("does not render for a meeting already dismissed this session", () => {
    sessionStorage.setItem(dismissalKey("live-2"), "dismissed");
    render(<AttendanceBannerClient meetingId="live-2" title="General body" />);
    expect(screen.queryByText("Check in now")).toBeNull();
  });

  it("stays dismissed after remounting, as on a client navigation", () => {
    const first = render(
      <AttendanceBannerClient meetingId="live-3" title="General body" />,
    );
    act(() => {
      screen.getByRole("button", { name: /dismiss/i }).click();
    });
    first.unmount();
    render(<AttendanceBannerClient meetingId="live-3" title="General body" />);
    expect(screen.queryByText("Check in now")).toBeNull();
  });
});
