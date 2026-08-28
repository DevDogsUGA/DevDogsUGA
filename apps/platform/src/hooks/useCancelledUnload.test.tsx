import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCancelledUnload } from "./useCancelledUnload";

/**
 * The link-account buttons submit a form whose action redirects to an OAuth
 * provider, so their pending state is never meant to resolve — the document is
 * supposed to be gone. When unsaved changes put a "Leave site?" prompt in the
 * way and the member chooses to stay, nothing resolves it and the button spins
 * forever. This is the signal that lets the form be remounted out of that.
 */

function Probe() {
  return <span data-testid="count">{useCancelledUnload()}</span>;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("useCancelledUnload", () => {
  it("counts nothing until a departure is actually attempted", () => {
    const { getByTestId } = render(<Probe />);
    act(() => void vi.runAllTimers());
    expect(getByTestId("count").textContent).toBe("0");
  });

  it("reports a departure the member backed out of", () => {
    const { getByTestId } = render(<Probe />);

    // The page is still here afterwards, which is the whole signal: had they
    // left, nothing below this line would have mattered.
    act(() => void window.dispatchEvent(new Event("beforeunload")));
    act(() => void vi.runAllTimers());

    expect(getByTestId("count").textContent).toBe("1");
  });

  it("reports each one, so a second attempt is not swallowed", () => {
    const { getByTestId } = render(<Probe />);

    act(() => void window.dispatchEvent(new Event("beforeunload")));
    act(() => void vi.runAllTimers());
    act(() => void window.dispatchEvent(new Event("beforeunload")));
    act(() => void vi.runAllTimers());

    expect(getByTestId("count").textContent).toBe("2");
  });

  it("stops listening once unmounted", () => {
    const { unmount } = render(<Probe />);
    unmount();

    // Nothing to assert on the DOM here; the point is that dispatching after
    // unmount must not schedule a setState on a component that is gone.
    expect(() => {
      window.dispatchEvent(new Event("beforeunload"));
      vi.runAllTimers();
    }).not.toThrow();
  });
});
