"use client";

import { useState } from "react";
import TargetedAppSelect from "./TargetedAppSelect";
import { PanelError, TargetGate, useTargetQuery } from "./panels";

interface TargetFeedback {
  id: string;
  type: string;
  severity: string | null;
  title: string;
  description: string;
  status: string;
  createdAt: string;
  feedbackTopics: { label: string } | null;
}

/**
 * Feedback submitted on the targeted instance.
 *
 * Read-only, and subject to RLS as whoever you signed in as there — which is
 * the useful part. Signed in as a plain member you see only your own
 * submissions; as a `canManageFeedback` holder you see everyone's. That is the
 * quickest way to check a read policy actually restricts what you think it does.
 */
export default function FeedbackPanel() {
  return (
    <TargetGate>
      <Inner />
    </TargetGate>
  );
}

function Inner() {
  const [appSlug, setAppSlug] = useState("");

  const { data: items, error } = useTargetQuery<TargetFeedback[]>(
    async (c) => {
      if (!appSlug) return [];
      const { data: app } = await c
        .from("apps")
        .select("id")
        .eq("slug", appSlug)
        .single();
      if (!app) return [];
      const { data, error: err } = await c
        .from("feedback")
        .select(
          "id, type, severity, title, description, status, createdAt, feedbackTopics(label)",
        )
        .eq("appId", app.id)
        .order("createdAt", { ascending: false })
        .limit(50);
      if (err) throw new Error(err.message);
      return (data ?? []) as unknown as TargetFeedback[];
    },
    [appSlug],
  );

  return (
    <div className="flex flex-col gap-3">
      <TargetedAppSelect value={appSlug} onChange={setAppSlug} />

      {(items ?? []).length === 0 ? (
        <p className="text-sm text-mauve-400">
          Nothing here. Either none has been submitted, or row-level security is
          hiding it from whoever you signed in as.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {(items ?? []).map((item) => (
            <li
              key={item.id}
              className="flex flex-col gap-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-white">
                  {item.title}
                </span>
                <span className="rounded-sm bg-white/10 px-1.5 py-0.5 text-[0.65rem] text-mauve-300">
                  {item.type.replace(/_/g, " ")}
                </span>
                {item.feedbackTopics?.label && (
                  <span className="rounded-sm bg-white/10 px-1.5 py-0.5 text-[0.65rem] text-mauve-300">
                    {item.feedbackTopics.label}
                  </span>
                )}
                {item.severity && (
                  <span className="rounded-sm bg-amber-400/15 px-1.5 py-0.5 text-[0.65rem] text-amber-300">
                    {item.severity}
                  </span>
                )}
              </div>
              <p className="line-clamp-3 text-xs whitespace-pre-wrap text-mauve-300">
                {item.description}
              </p>
            </li>
          ))}
        </ul>
      )}

      <PanelError message={error} />
    </div>
  );
}
