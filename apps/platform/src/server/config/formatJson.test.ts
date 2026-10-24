import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatJson } from "./formatJson";

const DATA = join(__dirname, "../../../../../packages/events/src/data");

describe("formatJson", () => {
  it.each(["meetings", "workshops", "venues"])(
    "writes %s.json byte for byte as it is committed",
    (name) => {
      const text = readFileSync(join(DATA, `${name}.json`), "utf8");
      expect(formatJson(JSON.parse(text))).toBe(text);
    },
  );

  it("keeps short scalar arrays on one line and breaks long ones", () => {
    expect(formatJson({ a: ["x", "y"], b: [] })).toBe(
      '{\n  "a": ["x", "y"],\n  "b": []\n}\n',
    );
    const long = Array.from({ length: 12 }, (_, i) => `item-number-${i}`);
    const out = formatJson({ list: long });
    expect(out).toContain('"list": [\n    "item-number-0",\n');
  });

  it("breaks an array of objects", () => {
    expect(formatJson({ a: [{ b: 1 }] })).toBe(
      '{\n  "a": [\n    {\n      "b": 1\n    }\n  ]\n}\n',
    );
  });
});
