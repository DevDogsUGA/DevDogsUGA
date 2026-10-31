/**
 * The guard against the two QR front ends drifting: `/dashboard/qr` and
 * `backstage qr` both read `qrRequestSchema`, and this fails the moment the
 * schema gains a field this CLI has no flag for.
 */
import {
  ERROR_LEVELS,
  QR_FORMATS,
  QR_LOGO_PRESETS,
  QR_THEMES,
  qrRequestSchema,
} from "@devdogsuga/sdk/brand/qr";
import { describe, expect, it } from "vitest";
import { catalog } from "../catalog.js";
import {
  ERROR_LEVEL_NAMES,
  FORMAT_NAMES,
  LOGO_PRESETS,
  QR_EXTRA_FLAGS,
  QR_FLAGS,
  qrCatalogOptions,
  THEMES,
} from "./options.js";

describe("the QR flags", () => {
  it("cover every field of the shared request schema, and nothing else", () => {
    expect(Object.keys(QR_FLAGS).sort()).toEqual(
      Object.keys(qrRequestSchema.shape).sort(),
    );
  });

  it("have unique names", () => {
    const names = [
      ...Object.values(QR_FLAGS),
      ...Object.values(QR_EXTRA_FLAGS),
    ].map((flag) => flag.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("all reach the command's help", () => {
    const declared = catalog
      .findCommand(["qr"])!
      .options!.map((option) => option.flag);
    for (const option of qrCatalogOptions()) {
      expect(declared).toContain(option.flag);
    }
  });

  it("list exactly the themes, logos, levels and formats the schema has", () => {
    // The command tree cannot import these (it is inert data), so this is
    // what keeps its copies honest.
    expect([...THEMES]).toEqual(Object.keys(QR_THEMES));
    expect([...LOGO_PRESETS]).toEqual(Object.keys(QR_LOGO_PRESETS));
    expect([...ERROR_LEVEL_NAMES]).toEqual([...ERROR_LEVELS]);
    expect([...FORMAT_NAMES]).toEqual([...QR_FORMATS]);
  });
});
