/**
 * Durable SQL approval, read exclusively through GitHub's API. Comments must
 * belong to github-actions[bot]; PR authors cannot forge approval by copying a
 * marker into their own comment. The label timeline event ties the record to
 * one application, so removing and re-adding the label permits a fresh review.
 */
import { createHash } from "node:crypto";
import { apiAll } from "./github-api.mjs";
import { isDevops, labelState } from "./destructive-label.mjs";

const MARKER = "<!-- allow-destructive ";

/** All inputs db-plan check reads, including configured seeds outside the usual directories.
 * @param {string} path
 */
const sqlInput = (path) => path.startsWith("supabase/");

/** @param {Array<{status: string, filename: string, sha: string, previous_filename?: string}>} files */
export function fingerprint(files) {
  const lines = files
    .filter((f) => sqlInput(f.filename) || sqlInput(f.previous_filename ?? ""))
    .map(
      (f) =>
        `${f.status} ${f.filename} ${f.sha}${f.previous_filename ? ` ${f.previous_filename}` : ""}`,
    )
    .sort();
  return createHash("sha256").update(lines.join("\n")).digest("hex");
}

/** @param {(path: string) => Promise<any>} api @param {string} repo @param {number} pr */
export async function currentFingerprint(api, repo, pr) {
  const files = await apiAll(api, `/repos/${repo}/pulls/${pr}/files`);
  // GitHub caps this endpoint at 3000 files. Refuse an incomplete approval.
  if (files.length >= 3000)
    throw new Error("Too many changed files to fingerprint safely.");
  return fingerprint(files);
}

/** @param {(path: string) => Promise<any>} api @param {string} repo @param {number} pr */
export async function labelEvent(api, repo, pr) {
  const events = await apiAll(api, `/repos/${repo}/issues/${pr}/timeline`);
  return String(
    events
      .filter(
        (e) => e.event === "labeled" && e.label?.name === "allow-destructive",
      )
      .at(-1)?.id ?? "",
  );
}

/** @param {(path: string) => Promise<any>} api @param {string} repo @param {number} pr */
export async function readApproval(api, repo, pr) {
  const comments = await apiAll(api, `/repos/${repo}/issues/${pr}/comments`);
  const comment = comments.find(
    (c) =>
      c.user?.login === "github-actions[bot]" &&
      c.user?.type === "Bot" &&
      c.body?.includes(MARKER),
  );
  if (!comment) return undefined;
  const match =
    /<!-- allow-destructive fingerprint=([a-f0-9]{64}|stale) approver=([\w-]+) event=(\d+) -->/.exec(
      comment.body,
    );
  return {
    id: comment.id,
    fingerprint: match?.[1],
    approver: match?.[2],
    event: match?.[3],
  };
}

/**
 * Serialized by the target workflow. A synchronize run never removes a label
 * whose application has not been recorded yet: its labeled run may be queued
 * behind this run. The read-only need check fails closed until that record exists.
 * @param {{api: (path: string) => Promise<any>, request: (method: string, path: string, body?: unknown) => Promise<any>, repo: string, pr: number, action?: string, head?: string}} input
 */
export async function reconcileApproval({
  api,
  request,
  repo,
  pr,
  action,
  head,
}) {
  const state = labelState(
    await apiAll(api, `/repos/${repo}/issues/${pr}/timeline`),
  );
  if (!state.present) return { pass: true, message: "No label to record." };
  if (!state.actor || !(await isDevops(api, repo, state.actor)))
    return {
      pass: false,
      reject: true,
      message: "Only devops may approve destructive SQL.",
    };
  const event = await labelEvent(api, repo, pr);
  const approval = await readApproval(api, repo, pr);
  const current = await currentFingerprint(api, repo, pr);
  let value = current;
  if (action === "labeled") {
    const pull = await api(`/repos/${repo}/pulls/${pr}`);
    if (pull.head.sha !== head)
      return {
        pass: false,
        message:
          "The head changed before approval was recorded; reapply the label after reviewing the current SQL.",
      };
  } else {
    if (!approval || approval.event !== event)
      return {
        pass: true,
        message: "Waiting for the label application to be recorded.",
      };
    if (approval.fingerprint === current)
      return { pass: true, message: "SQL unchanged: keeping the approval." };
    value = "stale";
  }
  // Labels can change while API reads are in flight even though workflow runs
  // are serialized. Leave a newer application for its own labeled run.
  if ((await labelEvent(api, repo, pr)) !== event)
    return { pass: true, message: "A newer label application is pending." };
  const body =
    `<!-- allow-destructive fingerprint=${value} approver=${state.actor} event=${event} -->\n` +
    (value === "stale"
      ? "Approval stale: the database inputs changed. Devops must review the new SQL and reapply allow-destructive."
      : `Database changes approved by @${state.actor}. Approval survives rebases that leave these files unchanged.\nFingerprint: ${current}.`);
  await request(
    approval ? "PATCH" : "POST",
    approval
      ? `/repos/${repo}/issues/comments/${approval.id}`
      : `/repos/${repo}/issues/${pr}/comments`,
    { body },
  );
  if (value === "stale")
    await request(
      "DELETE",
      `/repos/${repo}/issues/${pr}/labels/allow-destructive`,
    );
  return {
    pass: true,
    message:
      value === "stale" ? "Removed stale approval." : "Recorded SQL approval.",
  };
}
