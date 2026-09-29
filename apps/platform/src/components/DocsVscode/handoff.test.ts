import { describe, expect, it } from "vitest";
import { isHandoffMessage, parseHandoff, withSession } from "./handoff";

describe("parseHandoff", () => {
  it("reads the extension's handoff hash", () => {
    expect(
      parseHandoff(
        "#done=02-supabase%2F01-read,02-supabase%2F02-sign-in&session=abc%20123",
      ),
    ).toEqual({
      done: ["02-supabase/01-read", "02-supabase/02-sign-in"],
      session: "abc 123",
    });
  });

  it("ignores any other hash", () => {
    expect(parseHandoff("")).toBeNull();
    expect(parseHandoff("#heading")).toBeNull();
    expect(parseHandoff("#done=a")).toBeNull();
    expect(parseHandoff("#session=a")).toBeNull();
  });
});

describe("withSession", () => {
  const link = "vscode://devdogsuga.workshops/review?repo=o%2Fr&to=t";

  it("adds the session", () => {
    expect(withSession(link, "a b")).toBe(`${link}&session=a%20b`);
  });

  it("replaces one it already has", () => {
    expect(withSession(withSession(link, "one"), "two")).toBe(
      `${link}&session=two`,
    );
  });
});

describe("isHandoffMessage", () => {
  it("takes a session and a local path", () => {
    expect(isHandoffMessage({ session: "s", path: "/docs/a" })).toBe(true);
  });

  it("refuses anything that could leave the site", () => {
    expect(isHandoffMessage({ session: "s", path: "//evil.example" })).toBe(
      false,
    );
    expect(
      isHandoffMessage({ session: "s", path: "https://evil.example" }),
    ).toBe(false);
    expect(isHandoffMessage(null)).toBe(false);
  });
});
