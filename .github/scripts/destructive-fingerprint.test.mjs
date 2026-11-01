import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fingerprint,
  currentFingerprint,
  reconcileApproval,
} from "./destructive-fingerprint.mjs";
import { evaluateNeed } from "./destructive-label.mjs";

const file = (filename, sha = "a", status = "added") => ({
  filename,
  sha,
  status,
});
const files = [
  file("supabase/migrations/a.sql"),
  file("supabase/schemas/public.sql"),
];

test("fingerprint ignores order and non-database files, survives identical rebases, covers all database inputs and renames", () => {
  const hash = fingerprint(files);
  assert.equal(hash, fingerprint([...files].reverse()));
  assert.equal(hash, fingerprint([...files, file("README.md")]));
  for (const path of [
    "migrations/a.sql",
    "schemas/public.sql",
    "seed/a.sql",
    "roles.sql",
    "config.toml",
    "custom-seed.sql",
  ]) {
    assert.notEqual(
      hash,
      fingerprint([...files, file("supabase/" + path, "b")]),
    );
  }
  assert.notEqual(hash, fingerprint([file(files[0].filename, "b"), files[1]]));
  assert.notEqual(
    hash,
    fingerprint([file(files[0].filename, "a", "removed"), files[1]]),
  );
  assert.notEqual(
    fingerprint([
      { ...file("outside.sql"), previous_filename: "supabase/old.sql" },
    ]),
    fingerprint([]),
  );
});

function fixture({
  approved = true,
  changed = false,
  bot = true,
  role = "maintain",
  event = "42",
  label = true,
} = {}) {
  const writes = [];
  const api = async (path) => {
    if (path.includes("/timeline?"))
      return label
        ? [
            {
              id: 42,
              event: "labeled",
              label: { name: "allow-destructive" },
              actor: { login: "devops" },
            },
          ]
        : [];
    if (path.includes("/comments?"))
      return approved
        ? [
            {
              id: 7,
              user: {
                login: bot ? "github-actions[bot]" : "author",
                type: "Bot",
              },
              body: `<!-- allow-destructive fingerprint=${fingerprint(files)} approver=devops event=${event} -->`,
            },
          ]
        : [];
    if (path.includes("/files?"))
      return changed ? [...files, file("supabase/roles.sql")] : files;
    if (path.endsWith("/permission")) return { role_name: role };
    if (path.endsWith("/pulls/1")) return { head: { sha: "head" } };
    throw new Error(path);
  };
  return {
    api,
    writes,
    request: async (...args) => {
      writes.push(args);
    },
    repo: "O/R",
    pr: 1,
  };
}

test("need requires label, matching bot record, current event and devops permission", async () => {
  for (const options of [
    {},
    { approved: false },
    { changed: true },
    { bot: false },
    { role: "write" },
    { event: "41" },
    { label: false },
  ]) {
    const result = await evaluateNeed({
      ...fixture(options),
      destructive: true,
    });
    assert.equal(
      result.pass,
      Object.keys(options).length === 0,
      JSON.stringify(options),
    );
  }
});

test("reconcile preserves rebases, stales changed SQL, and leaves pending label approvals alone", async () => {
  const unchanged = fixture();
  await reconcileApproval({ ...unchanged, action: "synchronize" });
  assert.equal(unchanged.writes.length, 0);
  const changed = fixture({ changed: true });
  await reconcileApproval({ ...changed, action: "synchronize" });
  assert.equal(changed.writes[0][0], "PATCH");
  assert.match(changed.writes[0][2].body, /fingerprint=stale/);
  assert.equal(changed.writes[1][0], "DELETE");
  for (const options of [{ approved: false }, { event: "41", changed: true }]) {
    const pending = fixture(options);
    await reconcileApproval({ ...pending, action: "synchronize" });
    assert.equal(pending.writes.length, 0);
  }
});

test("devops label records approval in place, rejects old heads and non-devops", async () => {
  const input = fixture();
  await reconcileApproval({ ...input, action: "labeled", head: "head" });
  assert.equal(input.writes[0][0], "PATCH");
  assert.match(input.writes[0][2].body, /approver=devops event=42/);
  const old = fixture();
  assert.equal(
    (await reconcileApproval({ ...old, action: "labeled", head: "old" })).pass,
    false,
  );
  assert.equal(old.writes.length, 0);
  const bad = fixture({ role: "write" });
  assert.equal(
    (await reconcileApproval({ ...bad, action: "labeled", head: "head" }))
      .reject,
    true,
  );
});

test("fingerprint paginates the API and refuses GitHub's truncation boundary", async () => {
  const pages = [];
  const api = async (path) => {
    pages.push(path);
    return path.endsWith("page=1")
      ? Array.from({ length: 100 }, (_, i) =>
          file(`supabase/migrations/${i}.sql`),
        )
      : [file("supabase/last.sql")];
  };
  assert.equal((await currentFingerprint(api, "O/R", 1)).length, 64);
  assert.equal(pages.length, 2);
  await assert.rejects(
    currentFingerprint(
      async (path) =>
        path.endsWith("page=31") ? [] : Array(100).fill(files[0]),
      "O/R",
      1,
    ),
    /Too many/,
  );
});
