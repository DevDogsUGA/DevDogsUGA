"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon } from "@phosphor-icons/react/ssr";

/**
 * The two ways onto a team's branch: switching an existing clone of the
 * competition repo over to it, or cloning straight onto it.
 *
 * `git switch` with no `-c` creates the local branch tracking
 * `origin/<branch>` on its own once the fetch has brought that ref down, so
 * the first command works the first time and every time after.
 */
export default function BranchCommands({
  branch,
  cloneUrl,
}: {
  branch: string;
  cloneUrl: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <Command
        label="Already cloned the competition repo"
        command={`git fetch origin && git switch ${branch}`}
      />
      <Command
        label="Starting fresh"
        command={`git clone --branch ${branch} ${cloneUrl}`}
      />
    </div>
  );
}

function Command({ label, command }: { label: string; command: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied. The command is still on screen and
      // selectable, so there is nothing to recover from.
    }
  }

  return (
    <div>
      <p className="mb-1 text-xs text-mauve-400">{label}</p>
      <div className="flex items-stretch gap-2">
        <code className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-mauve-600 bg-mauve-900 px-3 py-2 font-mono text-sm whitespace-nowrap text-mauve-200">
          {command}
        </code>
        <button
          type="button"
          onClick={copy}
          aria-label={`Copy: ${command}`}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-mauve-600 bg-mauve-800 px-3 py-2 text-xs font-medium text-white transition-colors hover:border-white"
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
