import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  checkFlutterVersion,
  readFlutterPin,
  readCheckoutEnv,
} from "./commands.js";

describe("readCheckoutEnv", () => {
  let root: string;
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("lets the local stack's .env.generated win over .env's blank hosted template", () => {
    root = mkdtempSync(join(tmpdir(), "doctor-env-"));
    writeFileSync(
      join(root, ".env"),
      'API_URL="https://$PROJECT_REF.supabase.co"\nPUBLISHABLE_KEY=""\nCRON_SECRET="kept"\n',
    );
    writeFileSync(
      join(root, ".env.generated"),
      'API_URL="http://127.0.0.1:54321"\nPUBLISHABLE_KEY="sb_publishable_x"\nDB_URL=""\n',
    );
    expect(readCheckoutEnv(root)).toMatchObject({
      API_URL: "http://127.0.0.1:54321",
      PUBLISHABLE_KEY: "sb_publishable_x",
      CRON_SECRET: "kept",
    });
  });

  it("reads .env alone for a hosted checkout with no local stack", () => {
    root = mkdtempSync(join(tmpdir(), "doctor-env-"));
    writeFileSync(join(root, ".env"), 'API_URL="https://abc.supabase.co"\n');
    expect(readCheckoutEnv(root).API_URL).toBe("https://abc.supabase.co");
  });
});

describe("product Flutter pins", () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0))
      rmSync(root, { recursive: true, force: true });
  });
  function repo(pubspec?: string, product = true): string {
    const root = mkdtempSync(join(tmpdir(), "doctor-flutter-"));
    roots.push(root);
    if (product) writeFileSync(join(root, "devtools.config.json"), "{}");
    if (pubspec !== undefined)
      writeFileSync(join(root, "pubspec.yaml"), pubspec);
    return root;
  }

  it.each(["3.50.0", '"3.50.0"', "'3.50.0'", '">=3.50.0"', "'>=3.50.0'"])(
    "reads a Flutter pin %s",
    (pin) => {
      expect(
        readFlutterPin(repo(`environment:\n  flutter: ${pin} # team pin\n`)),
      ).toBe("3.50.0");
    },
  );

  it.each([
    undefined,
    "environment: [",
    "environment:\n  sdk: ^3.13.0",
    "environment:\n  flutter: '>=3.47.0 <4.0.0'",
    "environment:\n  flutter: '~3.50.0'",
    "environment:\n  flutter: ^3.50.0",
    "environment:\n  flutter: 3.50",
  ])("skips absent, invalid or ranged pins: %s", (pubspec) => {
    expect(readFlutterPin(repo(pubspec))).toBeNull();
  });

  it("ignores a non-product checkout", () => {
    expect(
      readFlutterPin(repo("environment:\n  flutter: 3.50.0", false)),
    ).toBeNull();
  });

  it("accepts the pinned version", () => {
    expect(
      checkFlutterVersion('{"frameworkVersion":"3.50.0"}', "3.50.0"),
    ).toMatchObject({ status: "ok", fix: undefined });
  });

  it.each(["3.47.5", "3.51.0", "3.50.0-1.0.pre"])(
    "warns for any mismatch, including newer versions: %s",
    (version) => {
      const check = checkFlutterVersion(
        JSON.stringify({ frameworkVersion: version }),
        "3.50.0",
      );
      expect(check.status).toBe("warn");
      expect(check.summary).toContain(version);
      expect(check.fix).toContain("Install Flutter 3.50.0");
    },
  );

  it.each([null, "not JSON", "{}", '{"frameworkVersion":350}'])(
    "warns when Flutter cannot report a version: %s",
    (output) => {
      expect(checkFlutterVersion(output, "3.50.0")).toMatchObject({
        status: "warn",
        fix: "Install Flutter 3.50.0 and put it on PATH.",
      });
    },
  );
});
