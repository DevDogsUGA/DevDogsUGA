"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "~/lib/actionResult";
import { toast } from "~/lib/toast";
import Callout from "~/ui/callout";

/**
 * Command performs one action: errors stay at the control and success is toasted.
 * Compose Commands for decisions and multi-step flows. Draft edits saved values
 * with Save/Discard and the save bar; redirecting actions stay plain forms.
 * For a FormData action, use `<form action={run}>`. run returns void, and owns
 * its transition so event handlers and form actions share the same pending state.
 */
export function useCommand<Args extends unknown[], T = undefined>(
  action: (...args: Args) => Promise<ActionResult<T>>,
  options?: { refresh?: boolean },
) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult<T> | null>(null);
  function run(...args: Args): void {
    startTransition(async () => {
      const next = await action(...args);
      setResult(next);
      if (next.ok) {
        if (options?.refresh !== false) router.refresh();
        if (next.message) toast.success(next.message);
      }
    });
  }
  return { run, pending, result };
}

/** Success is a toast. Expected failures remain beside the command. */
export function CommandFeedback({
  result,
}: {
  result: ActionResult<unknown> | null | undefined;
}) {
  if (!result || result.ok) return null;
  return (
    <Callout tone="critical" alert>
      {result.message}
    </Callout>
  );
}
