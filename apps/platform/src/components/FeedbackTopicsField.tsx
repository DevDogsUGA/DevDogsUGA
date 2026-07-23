"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  addFeedbackTopic,
  applyFeedbackTopicTemplate,
  removeFeedbackTopic,
} from "~/server/actions/feedbackTopics";
import type { FeedbackTopicItem } from "~/server/loaders/feedback";

type TemplateKey = Parameters<typeof applyFeedbackTopicTemplate>[0];

interface Props {
  topics: FeedbackTopicItem[];
  templates: { key: TemplateKey; label: string }[];
}

export default function FeedbackTopicsField({ topics, templates }: Props) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleAdd() {
    const trimmed = label.trim();
    if (!trimmed) return;
    setError(null);
    startTransition(async () => {
      try {
        await addFeedbackTopic(trimmed);
        setLabel("");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to add topic");
      }
    });
  }

  function handleRemove(topicId: string) {
    setError(null);
    startTransition(async () => {
      await removeFeedbackTopic(topicId);
      router.refresh();
    });
  }

  function handleTemplate(key: TemplateKey) {
    setError(null);
    startTransition(async () => {
      await applyFeedbackTopicTemplate(key);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {topics.length === 0 ? (
          <p className="text-sm text-mauve-400">No topics yet.</p>
        ) : (
          topics.map((topic) => (
            <span
              key={topic.id}
              className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80"
            >
              {topic.label}
              <button
                type="button"
                onClick={() => handleRemove(topic.id)}
                disabled={isPending}
                aria-label={`Remove ${topic.label}`}
                className="text-mauve-400 transition-colors hover:text-rose-400 disabled:opacity-50"
              >
                ×
              </button>
            </span>
          ))
        )}
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd();
          }}
          placeholder="New topic"
          maxLength={50}
          className="rounded-sm border border-mauve-600 bg-mauve-800 px-2 py-1.5 text-sm text-white outline-none placeholder:text-mauve-500 focus:border-white"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={isPending || !label.trim()}
          className="rounded-sm border border-mauve-600 bg-mauve-800 px-3 py-1.5 text-sm text-white transition-colors hover:border-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          Add
        </button>
      </div>

      {error && <p className="text-xs text-rose-400">{error}</p>}

      <div className="flex flex-wrap gap-2">
        {templates.map((template) => (
          <button
            key={template.key}
            type="button"
            onClick={() => handleTemplate(template.key)}
            disabled={isPending}
            className="rounded-sm border border-mauve-600 bg-mauve-800 px-3 py-1 text-xs text-white transition-colors hover:border-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Apply: {template.label}
          </button>
        ))}
      </div>
    </div>
  );
}
