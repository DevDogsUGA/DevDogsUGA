import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { jsonSchemas } from "./json-schema.js";

describe("data/*.schema.json", () => {
  it.each(Object.entries(jsonSchemas()))(
    "%s matches the zod schema (run `pnpm --filter @devdogsuga/events codegen`)",
    (name, schema) => {
      const committed = readFileSync(
        new URL(`./data/${name}`, import.meta.url),
        "utf8",
      );
      expect(JSON.parse(committed)).toEqual(schema);
    },
  );

  it("is what each data file's $schema points at", () => {
    for (const file of [
      "meetings",
      "series",
      "questions",
      "workshops",
      "venues",
    ]) {
      const data = JSON.parse(
        readFileSync(new URL(`./data/${file}.json`, import.meta.url), "utf8"),
      ) as { $schema?: string };
      expect(data.$schema).toBe(`./${file}.schema.json`);
    }
  });
});
