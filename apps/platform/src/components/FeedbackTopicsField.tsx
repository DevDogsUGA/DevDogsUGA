"use client";

import { useState, useTransition } from "react";
import { Button } from "~/ui/button";
import { Input } from "~/ui/input";
import ManageableList from "~/ui/manageable-list";
import {
  addFeedbackTopic,
  applyFeedbackTopicTemplate,
  removeFeedbackTopic,
} from "~/server/actions/moderationConfig";
import { FEEDBACK_TOPIC_TEMPLATES } from "~/server/actions/feedbackTopicsData";
import type { TopicRow } from "~/server/loaders/moderationConfig";

type TemplateKey = keyof typeof FEEDBACK_TOPIC_TEMPLATES;

const TEMPLATE_KEYS = Object.keys(FEEDBACK_TOPIC_TEMPLATES) as TemplateKey[];

interface Props {
  appId: string;
  initialTopics: TopicRow[];
  canEdit: boolean;
}

export default function FeedbackTopicsField({
  appId,
  initialTopics,
  canEdit,
}: Props) {
  const [topics, setTopics] = useState(initialTopics);
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!canEdit) {
    return topics.length === 0 ? (
      <p className="text-sm text-mauve-400">
        No topics configured for this app.
      </p>
    ) : (
      <div className="flex flex-wrap gap-2">
        {topics.map((topic) => (
          <span
            key={topic.id}
            className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-sm text-white"
          >
            {topic.label}
          </span>
        ))}
      </div>
    );
  }

  function handleAdd() {
    const trimmed = label.trim();
    if (!trimmed) return;
    setError(null);
    startTransition(async () => {
      try {
        const { id } = await addFeedbackTopic(appId, trimmed);
        setTopics((prev) => [...prev, { id, label: trimmed }]);
        setLabel("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not add topic.");
      }
    });
  }

  function handleRemove(id: string) {
    setError(null);
    startTransition(async () => {
      try {
        await removeFeedbackTopic(appId, id);
        setTopics((prev) => prev.filter((t) => t.id !== id));
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Could not remove topic.",
        );
      }
    });
  }

  function handleTemplate(key: TemplateKey) {
    setError(null);
    startTransition(async () => {
      try {
        await applyFeedbackTopicTemplate(appId, key);
        // The action inserts with onConflictDoNothing, so which rows actually
        // landed is a server-side fact. Reloading is how the list stays true to
        // it rather than optimistically showing duplicates it skipped.
        window.location.reload();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Could not apply template.",
        );
      }
    });
  }

  return (
    <ManageableList
      items={topics}
      onRemove={handleRemove}
      isPending={isPending}
      error={error}
      emptyLabel="No topics yet."
      renderItem={(topic, onRemove) => (
        <span
          key={topic.id}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-sm text-white"
        >
          {topic.label}
          <button
            type="button"
            onClick={onRemove}
            disabled={isPending}
            aria-label={`Remove ${topic.label}`}
            className="text-mauve-400 transition-colors hover:text-rose-400 disabled:opacity-50"
          >
            ×
          </button>
        </span>
      )}
      addForm={
        <div className="flex max-w-sm items-center gap-1.5">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
            }}
            placeholder="Topic label"
            maxLength={50}
          />
          <Button
            type="button"
            variant="secondary"
            onClick={handleAdd}
            disabled={isPending || !label.trim()}
          >
            Add
          </Button>
        </div>
      }
      actions={
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-mauve-400">
            Or start from a template:
          </span>
          <div className="flex flex-wrap gap-1.5">
            {TEMPLATE_KEYS.map((key) => (
              <Button
                key={key}
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleTemplate(key)}
                disabled={isPending}
              >
                {FEEDBACK_TOPIC_TEMPLATES[key].label}
              </Button>
            ))}
          </div>
        </div>
      }
    />
  );
}
