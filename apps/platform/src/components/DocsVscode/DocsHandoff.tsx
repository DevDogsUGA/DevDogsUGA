"use client";

import { useEffect } from "react";
import { markStepsDone, stepKey } from "~/components/DocsProgress/store";
import { HANDOFF_CHANNEL, parseHandoff } from "./handoff";

interface Props {
  project: string;
  /** The course's steps, each with the tag its step ends at, if it has one. */
  steps: { path: string; checkpoint?: string }[];
}

/**
 * The new tab's half of the round trip that starts at "Review in VS Code"
 * (see DocsVscode). After Finish the extension opens this page with
 * `#done=<step tags>&session=<id>`. This records those steps as done in the
 * reader's `docs:progress` (other tabs pick it up from the `storage` event),
 * tells the tab that started the review to move on to this page, and takes
 * the hash off the address.
 *
 * It renders nothing, and does not set state: everything it touches is the
 * browser's own (storage, a channel, the address bar).
 */
export default function DocsHandoff({ project, steps }: Props) {
  useEffect(() => {
    const handoff = parseHandoff(window.location.hash);
    if (!handoff) return;

    const keys = steps
      .filter(
        (step) => step.checkpoint && handoff.done.includes(step.checkpoint),
      )
      .map((step) => stepKey(project, step.path));
    markStepsDone(keys);

    // After the write, so the other tab reads the new progress on arrival.
    const channel = new BroadcastChannel(HANDOFF_CHANNEL);
    channel.postMessage({
      session: handoff.session,
      path: window.location.pathname + window.location.search,
    });
    channel.close();

    window.history.replaceState(
      window.history.state,
      "",
      window.location.pathname + window.location.search,
    );
  }, [project, steps]);

  return null;
}
