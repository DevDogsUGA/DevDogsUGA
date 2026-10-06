import assert from "node:assert/strict";
import { test } from "node:test";
import { areaOf, buildPlan, lockContent, parseLock } from "./deploy-pr.mjs";

const OLD = "a".repeat(40);
const NEW = "b1c2d3e".padEnd(40, "0");
const srcRepo = "DevDogsUGA/DevDogsUGA";

test("areaOf maps files to the top-level areas", () => {
  assert.equal(areaOf("apps/schedule-builder/src/x.ts"), "apps/schedule-builder");
  assert.equal(areaOf("apps/study-group-finder/lib/a.dart"), "apps/study-group-finder");
  assert.equal(areaOf("docs/a.md"), "docs");
  assert.equal(areaOf("packages/supabase/src/a.ts"), "packages/supabase");
  assert.equal(areaOf("supabase/migrations/1.sql"), "supabase");
  assert.equal(areaOf("README.md"), null);
  assert.equal(areaOf("packages/loose-file"), null);
  assert.equal(areaOf("docs-extra/a.md"), null);
});

test("lock file is one full SHA and a newline", () => {
  assert.equal(lockContent(NEW), `${NEW}\n`);
  assert.throws(() => lockContent("abc123"));
  assert.equal(parseLock(`${OLD}\n`), OLD);
  assert.equal(parseLock(""), "");
  assert.equal(parseLock("not a sha\n"), "");
});

test("plan links the compare range and lists migrations, seeds and areas", () => {
  const { title, body } = buildPlan({
    srcRepo,
    oldSha: OLD,
    newSha: NEW,
    files: [
      "supabase/migrations/20261001_b.sql",
      "supabase/migrations/20261001_a.sql",
      "supabase/seed/officers.sql",
      "docs/x.md",
      "packages/env/src/a.ts",
      "apps/platform/x.ts",
    ],
  });
  assert.equal(title, "deploy: DevDogsUGA b1c2d3e");
  assert.match(body, new RegExp(`compare/${OLD}\\.\\.\\.${NEW}`));
  assert.ok(body.indexOf("20261001_a.sql") < body.indexOf("20261001_b.sql"));
  assert.match(body, /\*\*Seed\*\*\n- `supabase\/seed\/officers.sql`/);
  for (const area of ["docs", "packages/env", "supabase"]) {
    assert.match(body, new RegExp(`- \`${area}\``));
  }
  assert.doesNotMatch(body, /apps\/platform/);
  assert.match(body, /Merging deploys staging; production waits for the `production` approval\./);
});

test("plan without an old pin links the commit", () => {
  const { body } = buildPlan({ srcRepo, oldSha: "", newSha: NEW, files: [] });
  assert.match(body, new RegExp(`/commit/${NEW}`));
  assert.doesNotMatch(body, /\*\*Migrations\*\*/);
  assert.match(body, /nothing under apps/);
});

test("plan survives an uncomputable change list", () => {
  const { body } = buildPlan({ srcRepo, oldSha: OLD, newSha: NEW, files: null });
  assert.match(body, /could not be computed/);
});
