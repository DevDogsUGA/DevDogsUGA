/**
 * File diffs: a fenced `diff` block that names its file becomes a placeholder
 * the platform renders as a diff viewer, rather than a highlighted code block.
 *
 * ````md
 * ```diff file=components/Guestbook.tsx lang=tsx
 * --- a/components/Guestbook.tsx
 * +++ b/components/Guestbook.tsx
 * @@ -1,4 +1,5 @@
 *  "use client";
 * -import { useState } from "react";
 * +import { useEffect, useState } from "react";
 * ```
 * ````
 *
 * The body is a real unified diff, `---`/`+++` headers included, so the
 * markdown still reads as a diff anywhere else (GitHub renders it as one).
 * `lang` is the file's language, for highlighting its lines; it defaults to
 * the file's extension. `href` is a link to the change on GitHub (a compare
 * view), shown in the viewer's bar; `vscode` is the block's `vscode=` link (see codeblocks.ts).
 *
 * `context=N` says the body is the whole file: one hunk from line 1 to the
 * end, every unchanged line as context. The placeholder then carries both
 * versions of the file and a patch cut down to `N` lines of context around
 * each change, so the viewer opens on the change and can expand the rest.
 *
 * The placeholder is an empty `<div data-docs-diff="…">` whose attribute is
 * the block's `{ file, lang, patch }` as base64 JSON: one attribute, nothing
 * an HTML serializer escapes differently from how the platform reads it back.
 * Only a block at the top level of the page becomes one. The platform swaps
 * placeholders in by splitting the page's HTML around them, which needs each
 * to sit between whole elements, never inside a list item or a quote; a
 * nested one stays an ordinary `diff` code block.
 */
import type { Code, Root } from "mdast";
import { metaAttribute as attribute, vscodeLink } from "./codeblocks.js";
import { codeIcon, type CodeIcon } from "./codeicons.js";
import { DocsBuildError } from "./errors.js";

/** What a placeholder carries, and what the platform's viewer needs. */
export interface DocsDiff {
  file: string;
  lang: string;
  /** The tab's file icon (see codeicons.ts). */
  icon: CodeIcon;
  patch: string;
  /** The file before and after the change, when the body is the whole file
   * (`context=`). */
  oldContent?: string;
  newContent?: string;
  href?: string;
  /** The `vscode://devdogsuga.workshops/review?…` link for this change. */
  vscode?: string;
}

interface Op {
  kind: " " | "-" | "+";
  line: string;
}

/** A whole-file diff's lines as ops, or an error saying why it isn't one. */
function wholeFileOps(patch: string): Op[] | string {
  const lines = patch.split("\n");
  const at = lines.findIndex((line) => line.startsWith("@@ "));
  const header = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(
    lines[at] ?? "",
  );
  if (!header || Number(header[1]) > 1 || Number(header[2]) > 1) {
    return "context= needs the whole file: one hunk starting at line 1";
  }
  const ops: Op[] = [];
  for (const line of lines.slice(at + 1)) {
    if (line.startsWith("@@")) {
      return "context= needs the whole file: one hunk, not several";
    }
    if (line.startsWith("\\")) continue; // "\ No newline at end of file"
    // A blank line is a blank context line whose leading space was trimmed.
    const kind = line === "" ? " " : line[0];
    if (kind !== " " && kind !== "-" && kind !== "+") {
      return `context=: ${JSON.stringify(line)} is not a diff line`;
    }
    ops.push({ kind: kind, line: line.slice(1) });
  }
  return ops;
}

/** The ops cut down to `context` unchanged lines around each change, as a
 * unified diff's hunks with the file's line numbers. */
function trimmedHunks(ops: Op[], context: number): string[] {
  const keep = ops.map(() => false);
  ops.forEach((op, k) => {
    if (op.kind === " ") return;
    for (
      let c = Math.max(0, k - context);
      c <= Math.min(ops.length - 1, k + context);
      c++
    ) {
      keep[c] = true;
    }
  });
  const out: string[] = [];
  let oldAt = 1;
  let newAt = 1;
  let k = 0;
  while (k < ops.length) {
    if (!keep[k]) {
      if (ops[k]!.kind !== "+") oldAt++;
      if (ops[k]!.kind !== "-") newAt++;
      k++;
      continue;
    }
    const start = k;
    while (k < ops.length && keep[k]) k++;
    const hunk = ops.slice(start, k);
    const oldCount = hunk.filter((op) => op.kind !== "+").length;
    const newCount = hunk.filter((op) => op.kind !== "-").length;
    const from = (at: number, count: number) =>
      `${count === 0 ? at - 1 : at},${count}`;
    out.push(`@@ -${from(oldAt, oldCount)} +${from(newAt, newCount)} @@`);
    out.push(...hunk.map((op) => `${op.kind}${op.line}`));
    oldAt += oldCount;
    newAt += newCount;
  }
  return out;
}

/** The `{ file, lang, patch }` a `diff file=…` block describes, or null for
 * any other code block. */
export function readDiff(node: Code): DocsDiff | null {
  if (node.lang !== "diff" || !node.meta) return null;
  const file = attribute(node.meta, "file");
  if (file === undefined) return null;

  const patch = node.value;
  const line = node.position?.start.line;
  if (
    !/^--- /m.test(patch) ||
    !/^\+\+\+ /m.test(patch) ||
    !/^@@ /m.test(patch)
  ) {
    throw new DocsBuildError(
      `diff block for ${file}${line === undefined ? "" : ` (line ${line})`}: needs a unified diff with ---/+++ headers and at least one @@ hunk`,
    );
  }
  const lang = attribute(node.meta, "lang") ?? file.split(".").pop() ?? "text";
  const href = attribute(node.meta, "href");
  const vscode = vscodeLink(node.meta, file);
  const diff: DocsDiff = {
    file,
    lang,
    icon: codeIcon(lang, file),
    patch,
    ...(href ? { href } : {}),
    ...(vscode ? { vscode } : {}),
  };

  const context = attribute(node.meta, "context");
  if (context === undefined) return diff;
  const where = `diff block for ${file}${line === undefined ? "" : ` (line ${line})`}`;
  if (!/^\d+$/.test(context)) {
    throw new DocsBuildError(
      `${where}: context=${context} is not a number of lines`,
    );
  }
  const ops = wholeFileOps(patch);
  if (typeof ops === "string") throw new DocsBuildError(`${where}: ${ops}`);
  const headers = patch.split("\n").filter((l) => /^(---|\+\+\+) /.test(l));
  return {
    ...diff,
    patch: [...headers, ...trimmedHunks(ops, Number(context))].join("\n"),
    oldContent: ops
      .filter((op) => op.kind !== "+")
      .map((op) => op.line)
      .join("\n"),
    newContent: ops
      .filter((op) => op.kind !== "-")
      .map((op) => op.line)
      .join("\n"),
  };
}

export function encodeDiff(diff: DocsDiff): string {
  return Buffer.from(JSON.stringify(diff), "utf-8").toString("base64");
}

/** Replaces each top-level `diff file=…` block with its placeholder. */
export function remarkDiffs() {
  return (tree: Root) => {
    tree.children = tree.children.map((node) => {
      if (node.type !== "code") return node;
      const diff = readDiff(node);
      if (!diff) return node;
      return {
        type: "html",
        value: `<div data-docs-diff="${encodeDiff(diff)}"></div>`,
      };
    });
  };
}
