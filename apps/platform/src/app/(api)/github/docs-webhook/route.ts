import { NextResponse } from "next/server";
import { env } from "~/env";
import { db } from "~/server/db";
import { isTrackedBranch, removeBranch, syncBranch } from "~/server/docs/sync";

// Syncs run inline; incremental blob diffing keeps them small, but allow
// headroom for a large first sync of a new branch.
export const maxDuration = 300;

const enc = new TextEncoder();

async function verifySignature(
  body: string,
  signature: string | null,
): Promise<boolean> {
  if (!signature || !env.GITHUB_WEBHOOK_SECRET) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(env.GITHUB_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  const expected = "sha256=" + Buffer.from(mac).toString("hex");
  // Constant-time comparison to prevent timing attacks
  if (expected.length !== signature.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return mismatch === 0;
}

interface PushEvent {
  ref: string;
  forced?: boolean;
  repository: { name: string };
  commits: {
    added: string[];
    modified: string[];
    removed: string[];
  }[];
}

interface BranchEvent {
  ref: string;
  ref_type: string;
  repository: { name: string };
}

async function getTrackedRepo(slug: string) {
  return db.query.docsRepos.findFirst({ where: { slug } });
}

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  if (!(await verifySignature(body, signature))) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const event = request.headers.get("x-github-event");

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return new NextResponse("Bad Request", { status: 400 });
  }

  if (event === "push") {
    const push = payload as PushEvent;
    const repoSlug = push.repository.name;
    const branch = push.ref.replace(/^refs\/heads\//, "");

    const repo = await getTrackedRepo(repoSlug);
    if (!repo || !isTrackedBranch(branch, repo.defaultBranch)) {
      return NextResponse.json({ ok: true, skipped: "untracked" });
    }

    // The commit list is only a cheap filter — the sync itself diffs by blob
    // sha, so a forced push (empty/unreliable commit list) still syncs fully.
    const docsTouched =
      push.forced === true ||
      push.commits.some((commit) =>
        [...commit.added, ...commit.modified, ...commit.removed].some((path) =>
          path.startsWith("docs/"),
        ),
      );
    if (!docsTouched) {
      return NextResponse.json({ ok: true, skipped: "no-docs-changes" });
    }

    const result = await syncBranch(repoSlug, branch);
    return NextResponse.json({ ok: true, repo: repoSlug, branch, ...result });
  }

  if (event === "create" || event === "delete") {
    const change = payload as BranchEvent;
    if (change.ref_type !== "branch") {
      return NextResponse.json({ ok: true, skipped: "not-a-branch" });
    }

    const repoSlug = change.repository.name;
    const repo = await getTrackedRepo(repoSlug);
    if (!repo || !isTrackedBranch(change.ref, repo.defaultBranch)) {
      return NextResponse.json({ ok: true, skipped: "untracked" });
    }

    const result =
      event === "create"
        ? await syncBranch(repoSlug, change.ref)
        : await removeBranch(repoSlug, change.ref);
    return NextResponse.json({
      ok: true,
      repo: repoSlug,
      branch: change.ref,
      ...result,
    });
  }

  return NextResponse.json({ ok: true, skipped: "unhandled-event" });
}
