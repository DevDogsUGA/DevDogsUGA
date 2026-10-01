import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AttendanceBanner from "./index";
import { dismiss, dismissalKey, isDismissed } from "./dismissal";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.unstubAllGlobals();
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

describe("AttendanceBanner", () => {
  function mountWith(meeting: { id: string; title: string } | null) {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(Response.json({ meeting }))),
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const ui = (
      <QueryClientProvider client={client}>
        <AttendanceBanner />
      </QueryClientProvider>
    );
    const view = render(ui);
    return view;
  }

  it("renders nothing until the meeting arrives, then shows it", async () => {
    mountWith({ id: "live-1", title: "General body" });
    expect(screen.queryByText("Check in now")).toBeNull();
    expect(await screen.findByText("Check in now")).toBeTruthy();
    expect(screen.getByText("General body")).toBeTruthy();
  });

  it("renders nothing when no meeting is running", async () => {
    mountWith(null);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByText("Check in now")).toBeNull();
  });

  it("goes away on dismiss", async () => {
    mountWith({ id: "live-2", title: "General body" });
    await screen.findByText("Check in now");
    act(() => {
      screen.getByRole("button", { name: /dismiss/i }).click();
    });
    expect(screen.queryByText("Check in now")).toBeNull();
  });

  it("never paints a meeting already dismissed this session", async () => {
    sessionStorage.setItem(dismissalKey("live-3"), "dismissed");
    const { container } = mountWith({ id: "live-3", title: "General body" });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.queryByText("Check in now")).toBeNull();
    expect(container.querySelector("aside")).toBeNull();
  });

  it("stays dismissed after remounting, as on a client navigation", async () => {
    const first = mountWith({ id: "live-4", title: "General body" });
    await screen.findByText("Check in now");
    act(() => {
      screen.getByRole("button", { name: /dismiss/i }).click();
    });
    first.unmount();
    mountWith({ id: "live-4", title: "General body" });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.queryByText("Check in now")).toBeNull();
  });
});
