import { describe, expect, it } from "vitest";
import {
  shouldInterceptNavigation,
  type NavigationIntent,
} from "./navigationGuard";

/**
 * This runs against every click in the document while the account form is
 * dirty, so a wrong `true` is a link that silently stops working. The negative
 * cases matter more than the positive one.
 */

const HERE = "https://devdogs.uga.edu/account";

function intent(overrides: Partial<NavigationIntent> = {}): NavigationIntent {
  return {
    href: "https://devdogs.uga.edu/community",
    target: null,
    hasDownload: false,
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...overrides,
  };
}

describe("shouldInterceptNavigation", () => {
  it("intercepts a plain left-click to another page on this site", () => {
    expect(shouldInterceptNavigation(intent(), HERE)).toBe(true);
  });

  it("leaves non-primary buttons alone", () => {
    expect(shouldInterceptNavigation(intent({ button: 1 }), HERE)).toBe(false);
    expect(shouldInterceptNavigation(intent({ button: 2 }), HERE)).toBe(false);
  });

  it.each(["metaKey", "ctrlKey", "shiftKey", "altKey"] as const)(
    "leaves %s clicks alone, since they open elsewhere",
    (modifier) => {
      expect(
        shouldInterceptNavigation(intent({ [modifier]: true }), HERE),
      ).toBe(false);
    },
  );

  it("leaves downloads and new-tab targets alone", () => {
    expect(shouldInterceptNavigation(intent({ hasDownload: true }), HERE)).toBe(
      false,
    );
    expect(shouldInterceptNavigation(intent({ target: "_blank" }), HERE)).toBe(
      false,
    );
  });

  it("still intercepts an explicit target=_self", () => {
    expect(shouldInterceptNavigation(intent({ target: "_self" }), HERE)).toBe(
      true,
    );
  });

  it("leaves other origins to the browser's own unload prompt", () => {
    expect(
      shouldInterceptNavigation(
        intent({ href: "https://github.com/devdogsuga" }),
        HERE,
      ),
    ).toBe(false);
  });

  it("leaves same-page anchors alone", () => {
    expect(
      shouldInterceptNavigation(
        intent({ href: "https://devdogs.uga.edu/account#links" }),
        HERE,
      ),
    ).toBe(false);
  });

  it("intercepts a same-path link that changes the query", () => {
    // A different search is a different render of the page, and this page's
    // form does not survive it.
    expect(
      shouldInterceptNavigation(
        intent({ href: "https://devdogs.uga.edu/account?tab=links" }),
        HERE,
      ),
    ).toBe(true);
  });

  it("resolves relative hrefs against the current page", () => {
    expect(
      shouldInterceptNavigation(intent({ href: "/community" }), HERE),
    ).toBe(true);
    expect(shouldInterceptNavigation(intent({ href: "#top" }), HERE)).toBe(
      false,
    );
  });

  it("treats odd-looking but valid relative paths as navigation", () => {
    // "::::" resolves to /::::, a real same-origin path, not a parse failure.
    expect(shouldInterceptNavigation(intent({ href: "::::" }), HERE)).toBe(
      true,
    );
  });

  it("does not throw on an href that fails to parse", () => {
    // A bare scheme with no host throws inside new URL(). An anchor's .href
    // IDL attribute is always absolute and resolved, so this is defensive.
    // Still, the listener runs on every click in the document and must not be
    // the thing that throws.
    expect(shouldInterceptNavigation(intent({ href: "http://" }), HERE)).toBe(
      false,
    );
  });
});
