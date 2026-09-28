import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import {
  DOCS_VARIANTS_KEY,
  guessOs,
  parsePrefs,
  prePaintScript,
  resolveVariant,
  type OfferedVariants,
} from "./docsVariants";

const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)";
const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";
const LINUX = "Mozilla/5.0 (X11; Linux x86_64)";

const platform: OfferedVariants = {
  os: ["macos", "linux", "wsl"],
  supabase: ["hosted", "local"],
};
const sgf: OfferedVariants = {
  os: ["macos", "linux", "wsl", "windows"],
  supabase: ["hosted", "local"],
};

describe("resolveVariant", () => {
  it("keeps a choice the project offers", () => {
    expect(resolveVariant("os", "linux", platform.os!)).toBe("linux");
  });

  it("maps native Windows to WSL2 where native is not offered", () => {
    expect(resolveVariant("os", "windows", platform.os!)).toBe("wsl");
    expect(resolveVariant("os", "windows", sgf.os!)).toBe("windows");
  });

  it("falls back to the first offered value", () => {
    expect(resolveVariant("supabase", undefined, platform.supabase!)).toBe(
      "hosted",
    );
  });
});

describe("parsePrefs", () => {
  it("survives anything localStorage might hold", () => {
    expect(parsePrefs(null)).toEqual({});
    expect(parsePrefs("not json")).toEqual({});
    expect(parsePrefs("null")).toEqual({});
    expect(parsePrefs('{"os":"wsl"}')).toEqual({ os: "wsl" });
  });
});

/** Runs the inline script against a fake page and reads what it set. */
function runScript(
  offered: OfferedVariants,
  userAgent: string,
  stored: string | null,
): Record<string, string> {
  const attributes: Record<string, string> = {};
  const parentElement = {
    setAttribute: (name: string, value: string) => {
      attributes[name] = value;
    },
  };
  runInNewContext(prePaintScript(offered), {
    document: { currentScript: { parentElement } },
    navigator: { userAgent },
    localStorage: {
      getItem: (key: string) => (key === DOCS_VARIANTS_KEY ? stored : null),
    },
  });
  return attributes;
}

/** What the script should set, computed with the TypeScript functions. */
function expected(
  offered: OfferedVariants,
  userAgent: string,
  stored: string | null,
): Record<string, string> {
  const prefs = parsePrefs(stored);
  return Object.fromEntries(
    Object.entries(offered).map(([group, values]) => [
      `data-${group}`,
      resolveVariant(
        group,
        prefs[group] ?? (group === "os" ? guessOs(userAgent) : undefined),
        values,
      ),
    ]),
  );
}

describe("prePaintScript", () => {
  const cases: [OfferedVariants, string, string | null][] = [
    [platform, MAC, null],
    [platform, WINDOWS, null],
    [sgf, WINDOWS, null],
    [platform, LINUX, null],
    [platform, MAC, '{"os":"windows","supabase":"local"}'],
    [sgf, MAC, '{"os":"windows"}'],
    [platform, WINDOWS, "garbage"],
  ];

  it.each(cases)("agrees with the TypeScript (%#)", (offered, ua, stored) => {
    expect(runScript(offered, ua, stored)).toEqual(
      expected(offered, ua, stored),
    );
  });
});
