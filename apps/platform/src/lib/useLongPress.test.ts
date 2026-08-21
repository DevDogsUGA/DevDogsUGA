import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLongPress } from "./useLongPress";

/**
 * The handlers are exercised directly with hand-built events rather than
 * through the DOM: jsdom has no real PointerEvent, and the hook's contract is
 * exactly these props anyway.
 */
function pointer(
  overrides: Partial<{ pointerType: string; clientX: number; clientY: number }>,
) {
  return {
    pointerType: "touch",
    clientX: 0,
    clientY: 0,
    ...overrides,
  } as unknown as React.PointerEvent;
}

function mouse() {
  const preventDefault = vi.fn();
  const stopPropagation = vi.fn();
  return {
    event: { preventDefault, stopPropagation } as unknown as React.MouseEvent,
    preventDefault,
    stopPropagation,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useLongPress", () => {
  it("does not fire while the finger is still down", () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));

    result.current.onPointerDown(pointer({}));
    vi.advanceTimersByTime(10_000);

    // The share sheet and clipboard need the transient user activation that
    // only the release grants, so firing here would always fail.
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("fires on release once the delay has passed", () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));

    result.current.onPointerDown(pointer({}));
    vi.advanceTimersByTime(500);
    result.current.onPointerUp();

    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it("treats a release before the delay as a tap", () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));

    result.current.onPointerDown(pointer({}));
    vi.advanceTimersByTime(499);
    result.current.onPointerUp();
    vi.advanceTimersByTime(10_000);

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("treats a press that travels as a scroll", () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));

    result.current.onPointerDown(pointer({ clientX: 0, clientY: 0 }));
    result.current.onPointerMove(pointer({ clientX: 0, clientY: 40 }));
    vi.advanceTimersByTime(10_000);
    result.current.onPointerUp();

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("ignores a mouse entirely", () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));

    result.current.onPointerDown(pointer({ pointerType: "mouse" }));
    vi.advanceTimersByTime(10_000);
    result.current.onPointerUp();

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("does not fire after the browser cancels the pointer", () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));

    result.current.onPointerDown(pointer({}));
    vi.advanceTimersByTime(500);
    result.current.onPointerCancel();
    result.current.onPointerUp();

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("swallows the click a fired press produces", () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));

    result.current.onPointerDown(pointer({}));
    vi.advanceTimersByTime(500);
    result.current.onPointerUp();
    const click = mouse();
    result.current.onClickCapture(click.event);

    expect(click.preventDefault).toHaveBeenCalled();
    expect(click.stopPropagation).toHaveBeenCalled();
  });

  it("lets an ordinary tap's click through", () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));

    result.current.onPointerDown(pointer({}));
    result.current.onPointerUp();
    const click = mouse();
    result.current.onClickCapture(click.event);

    expect(click.preventDefault).not.toHaveBeenCalled();
  });

  it("suppresses the native context menu for the whole touch press", () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));

    result.current.onPointerDown(pointer({}));
    // Android's own long-press menu can beat the timer, so suppression cannot
    // wait for the press to arm.
    const during = mouse();
    result.current.onContextMenu(during.event);
    expect(during.preventDefault).toHaveBeenCalled();
  });

  it("leaves the context menu alone when no touch press is active", () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));

    const rightClick = mouse();
    result.current.onContextMenu(rightClick.event);
    expect(rightClick.preventDefault).not.toHaveBeenCalled();
  });
});
