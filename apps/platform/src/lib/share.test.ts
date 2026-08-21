import { afterEach, describe, expect, it, vi } from "vitest";
import { shareOrCopy } from "./share";

/**
 * Swaps in a `navigator` for one call. jsdom's has neither `share` nor
 * `canShare`, and its `clipboard` is not writable, so both are replaced
 * wholesale and restored after each test.
 */
function stubNavigator(props: {
  canShare?: (data: unknown) => boolean;
  share?: (data: unknown) => Promise<void>;
  writeText?: (text: string) => Promise<void>;
}) {
  const writeText = props.writeText ?? vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", {
    canShare: props.canShare,
    share: props.share,
    clipboard: { writeText },
  });
  return { writeText };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("shareOrCopy", () => {
  it("resolves a relative url against the current origin before sharing", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ canShare: () => true, share });

    await expect(
      shareOrCopy({ title: "DevDogs Platform", url: "/" }),
    ).resolves.toBe("shared");
    expect(share).toHaveBeenCalledWith({
      title: "DevDogs Platform",
      url: `${window.location.origin}/`,
    });
  });

  it("leaves an absolute url alone", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ canShare: () => true, share });

    await shareOrCopy({ title: "DogDays", url: "https://dogdays.dev" });
    expect(share).toHaveBeenCalledWith({
      title: "DogDays",
      url: "https://dogdays.dev/",
    });
  });

  it("asks canShare with the real payload, not an empty one", async () => {
    const canShare = vi.fn().mockReturnValue(true);
    stubNavigator({ canShare, share: vi.fn().mockResolvedValue(undefined) });

    await shareOrCopy({ title: "DogDays", url: "https://dogdays.dev" });
    expect(canShare).toHaveBeenCalledWith({
      title: "DogDays",
      url: "https://dogdays.dev/",
    });
  });

  it("reports a dismissed sheet without falling back to the clipboard", async () => {
    const { writeText } = stubNavigator({
      canShare: () => true,
      share: vi.fn().mockRejectedValue(new DOMException("no", "AbortError")),
    });

    await expect(
      shareOrCopy({ title: "DogDays", url: "https://dogdays.dev" }),
    ).resolves.toBe("dismissed");
    expect(writeText).not.toHaveBeenCalled();
  });

  it("copies when the share sheet fails for any other reason", async () => {
    const { writeText } = stubNavigator({
      canShare: () => true,
      share: vi
        .fn()
        .mockRejectedValue(new DOMException("nope", "NotAllowedError")),
    });

    await expect(
      shareOrCopy({ title: "DogDays", url: "https://dogdays.dev" }),
    ).resolves.toBe("copied");
    expect(writeText).toHaveBeenCalledWith("https://dogdays.dev/");
  });

  it("copies when there is no share sheet at all", async () => {
    const { writeText } = stubNavigator({});

    await expect(
      shareOrCopy({ title: "DogDays", url: "https://dogdays.dev" }),
    ).resolves.toBe("copied");
    expect(writeText).toHaveBeenCalledWith("https://dogdays.dev/");
  });

  it("copies when canShare refuses the payload", async () => {
    const share = vi.fn();
    const { writeText } = stubNavigator({ canShare: () => false, share });

    await expect(
      shareOrCopy({ title: "DogDays", url: "https://dogdays.dev" }),
    ).resolves.toBe("copied");
    expect(share).not.toHaveBeenCalled();
    expect(writeText).toHaveBeenCalled();
  });

  it("reports failure when the clipboard is unavailable too", async () => {
    stubNavigator({
      writeText: vi.fn().mockRejectedValue(new Error("denied")),
    });

    await expect(
      shareOrCopy({ title: "DogDays", url: "https://dogdays.dev" }),
    ).resolves.toBe("failed");
  });
});
