// Opens (or updates) the deploy PR in DevDogsUGA/Backstage for a DevDogsUGA
// commit that passed CI. Backstage pins DevDogsUGA with `devdogsuga.lock`, one
// full commit SHA; merging the PR there deploys staging, and production waits
// for its `production` approval.
//
// No dependencies and no Backstage checkout: everything in Backstage goes
// through the REST API, so the commit is authored by the GitHub App whose token
// is in GH_TOKEN. The change list comes from this repository's own checkout
// (full history), not the compare API, which stops listing files at 300.
//
//   GH_TOKEN    App token for Backstage (contents + pull_requests write)
//   NEW_SHA     the DevDogsUGA commit to deploy (github.sha)
//   SRC_REPO    DevDogsUGA/DevDogsUGA (github.repository)
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const TARGET_REPO = "DevDogsUGA/Backstage";
export const LOCK_PATH = "devdogsuga.lock";
export const BRANCH = "deploy/devdogsuga";

const AREAS = ["apps/schedule-builder", "apps/study-group-finder", "docs", "supabase"];

/** `packages/y/…` -> `packages/y`, a known area -> itself, anything else null. */
export function areaOf(file) {
  for (const area of AREAS) {
    if (file === area || file.startsWith(`${area}/`)) return area;
  }
  const pkg = /^packages\/[^/]+(?=\/)/.exec(file);
  return pkg ? pkg[0] : null;
}

/** The lock file's content for a SHA: one full SHA and a trailing newline. */
export function lockContent(sha) {
  if (!/^[0-9a-f]{40}$/.test(sha)) {
    throw new Error(`devdogsuga.lock needs a full 40-char SHA, got "${sha}"`);
  }
  return `${sha}\n`;
}

/** The SHA a lock file pins, or "" when it holds none. */
export function parseLock(text) {
  const sha = text.trim();
  return /^[0-9a-f]{40}$/.test(sha) ? sha : "";
}

/** Title and body for the deploy PR. `files` are paths changed old..new, or null. */
export function buildPlan({ srcRepo, oldSha, newSha, files }) {
  const base = `https://github.com/${srcRepo}`;
  const title = `deploy: DevDogsUGA ${newSha.slice(0, 7)}`;
  const link = oldSha
    ? `[${oldSha.slice(0, 7)}...${newSha.slice(0, 7)}](${base}/compare/${oldSha}...${newSha})`
    : `[${newSha.slice(0, 7)}](${base}/commit/${newSha})`;

  const lines = [`Pins DevDogsUGA at ${link}.`, ""];

  if (files === null) {
    lines.push("The list of changes could not be computed; use the link above.", "");
  } else {
    const section = (heading, prefix) => {
      const hit = files.filter((f) => f.startsWith(prefix)).sort();
      if (hit.length === 0) return;
      lines.push(`**${heading}**`, ...hit.map((f) => `- \`${f}\``), "");
    };
    section("Migrations", "supabase/migrations/");
    section("Seed", "supabase/seed/");

    const areas = [...new Set(files.map(areaOf).filter(Boolean))].sort();
    lines.push(
      "**Changed**",
      areas.length
        ? areas.map((a) => `- \`${a}\``).join("\n")
        : "- nothing under apps, docs, packages or supabase",
      "",
    );
  }

  lines.push(
    "Merging deploys staging; production waits for the `production` approval.",
    "",
    "_Opened by CI from DevDogsUGA; a newer push to main updates this PR._",
  );
  return { title, body: lines.join("\n") };
}

// --- API plumbing (not unit-tested; exercised by the workflow) --------------

async function api(token, method, path, body) {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "content-type": "application/json",
      "user-agent": "devdogs-deploy-pr",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  return { status: res.status, ok: res.ok, json };
}

async function must(token, method, path, body) {
  const res = await api(token, method, path, body);
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(res.json)}`);
  }
  return res.json;
}

/**
 * Paths changed old..new, from the local checkout, or null when they cannot be
 * listed (no old pin is [], an old pin missing from this history is null).
 *
 * ⚠️ Not the compare API: it lists at most 300 files, alphabetically, so a
 * large range (removing apps/platform) hid every docs/, packages/ and
 * supabase/ change, migrations included, and the PR said "nothing".
 */
function changedFiles(oldSha, newSha) {
  if (!oldSha) return [];
  try {
    return execFileSync("git", ["diff", "--name-only", oldSha, newSha], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    })
      .split("\n")
      .filter(Boolean);
  } catch {
    return null;
  }
}

async function run() {
  const { GH_TOKEN, NEW_SHA, SRC_REPO } = process.env;
  for (const [name, value] of Object.entries({ GH_TOKEN, NEW_SHA, SRC_REPO })) {
    if (!value) throw new Error(`${name} is not set`);
  }
  const newSha = NEW_SHA;
  const lock = lockContent(newSha);

  const mainRef = await must(GH_TOKEN, "GET", `/repos/${TARGET_REPO}/git/ref/heads/main`);
  const mainSha = mainRef.object.sha;
  const mainCommit = await must(GH_TOKEN, "GET", `/repos/${TARGET_REPO}/git/commits/${mainSha}`);

  const current = await api(GH_TOKEN, "GET", `/repos/${TARGET_REPO}/contents/${LOCK_PATH}?ref=main`);
  if (!current.ok && current.status !== 404) {
    throw new Error(`reading ${LOCK_PATH}: ${current.status} ${JSON.stringify(current.json)}`);
  }
  const oldSha = current.ok
    ? parseLock(Buffer.from(current.json.content, "base64").toString("utf8"))
    : "";
  if (oldSha === newSha) {
    console.log(`Backstage main already pins ${newSha}; nothing to do.`);
    return;
  }

  const files = changedFiles(oldSha, newSha);
  const { title, body } = buildPlan({ srcRepo: SRC_REPO, oldSha, newSha, files });

  // One commit on top of Backstage main, authored by the App (no author given).
  const tree = await must(GH_TOKEN, "POST", `/repos/${TARGET_REPO}/git/trees`, {
    base_tree: mainCommit.tree.sha,
    tree: [{ path: LOCK_PATH, mode: "100644", type: "blob", content: lock }],
  });
  const commit = await must(GH_TOKEN, "POST", `/repos/${TARGET_REPO}/git/commits`, {
    message: title,
    tree: tree.sha,
    parents: [mainSha],
  });

  const ref = await api(GH_TOKEN, "GET", `/repos/${TARGET_REPO}/git/ref/heads/${BRANCH}`);
  if (ref.ok) {
    await must(GH_TOKEN, "PATCH", `/repos/${TARGET_REPO}/git/refs/heads/${BRANCH}`, {
      sha: commit.sha,
      force: true,
    });
  } else if (ref.status === 404) {
    await must(GH_TOKEN, "POST", `/repos/${TARGET_REPO}/git/refs`, {
      ref: `refs/heads/${BRANCH}`,
      sha: commit.sha,
    });
  } else {
    throw new Error(`reading ${BRANCH}: ${ref.status} ${JSON.stringify(ref.json)}`);
  }

  const owner = TARGET_REPO.split("/")[0];
  const open = await must(
    GH_TOKEN,
    "GET",
    `/repos/${TARGET_REPO}/pulls?state=open&head=${owner}:${BRANCH}&base=main`,
  );
  if (open.length > 0) {
    const pr = await must(GH_TOKEN, "PATCH", `/repos/${TARGET_REPO}/pulls/${open[0].number}`, {
      title,
      body,
    });
    console.log(`Updated ${pr.html_url}`);
  } else {
    const pr = await must(GH_TOKEN, "POST", `/repos/${TARGET_REPO}/pulls`, {
      title,
      body,
      head: BRANCH,
      base: "main",
    });
    console.log(`Opened ${pr.html_url}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  run().catch((err) => {
    console.error(`::error::deploy PR failed: ${err.message}`);
    process.exit(1);
  });
}
