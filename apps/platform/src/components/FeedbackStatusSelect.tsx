"use client";

import { useState, useTransition } from "react";

export type FeedbackStatus = "open" | "in_review" | "resolved" | "dismissed";

const STATUS_LABELS: Record<FeedbackStatus, string> = {
  open: "Open",
  in_review: "In Review",
  resolved: "Resolved",
  dismissed: "Dismissed",
};

interface Props {
  feedbackId: string;
  status: FeedbackStatus;
  updateStatus: (feedbackId: string, status: FeedbackStatus) => Promise<void>;
}

export default function FeedbackStatusSelect({
  feedbackId,
  status,
  updateStatus,
}: Props) {
  const [current, setCurrent] = useState(status);
  const [isPending, startTransition] = useTransition();

  return (
    <select
      value={current}
      disabled={isPending}
      onChange={(e) => {
        const next = e.target.value as FeedbackStatus;
        const previous = current;
        setCurrent(next);
        startTransition(async () => {
          try {
            await updateStatus(feedbackId, next);
          } catch {
            setCurrent(previous);
          }
        });
      }}
      className="rounded-sm border border-mauve-600 bg-mauve-800 px-2 py-1.5 text-sm text-white outline-none focus:border-white disabled:opacity-50"
    >
      {Object.entries(STATUS_LABELS).map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
  );
}
