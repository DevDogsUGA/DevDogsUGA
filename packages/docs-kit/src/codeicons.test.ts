import { describe, expect, it } from "vitest";
import { codeIcon } from "./codeicons.js";

describe("codeIcon", () => {
  it("goes by the file's name before the fence's language", () => {
    expect(codeIcon("typescript", "app/page.tsx")).toBe("tsx");
    expect(codeIcon("text", "lib/supabase.ts")).toBe("ts");
    expect(codeIcon("dotenv", ".env.example")).toBe("config");
    expect(codeIcon("toml", "supabase/config.toml")).toBe("config");
  });

  it("falls back to the language, then to a plain code file", () => {
    expect(codeIcon("sql")).toBe("sql");
    expect(codeIcon("typescript", "Dockerfile")).toBe("ts");
    expect(codeIcon("dart", "lib/main.dart")).toBe("code");
  });
});
