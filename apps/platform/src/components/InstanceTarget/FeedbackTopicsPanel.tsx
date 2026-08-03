"use client";

import { useState, useTransition } from "react";
import { FEEDBACK_TOPIC_TEMPLATES } from "~/server/actions/feedbackTopicsData";
import TargetedAppSelect from "./TargetedAppSelect";
import {
  PanelError,
  TargetGate,
  useTargetClient,
  useTargetQuery,
} from "./panels";

const inputClass =
  "max-w-sm rounded-sm border border-mauve-600 bg-mauve-800 px-2 py-1.5 text-sm text-white outline-none placeholder:text-mauve-500 focus:border-white";
const buttonClass =
  "self-start rounded-sm border border-mauve-600 bg-mauve-800 px-3 py-1.5 text-sm text-white transition-colors hover:border-white disabled:cursor-not-allowed disabled:opacity-50";

interface Topic {
  id: string;
  label: string;
}

const TEMPLATES = Object.entries(FEEDBACK_TOPIC_TEMPLATES).map(
  ([key, template]) => ({
    key,
    label: template.label,
    topics: [...template.topics] as string[],
  }),
);

/** Feedback topics for an app on the targeted instance. */
export default function FeedbackTopicsPanel() {
  return (
    <TargetGate>
      <Inner />
    </TargetGate>
  );
}

function Inner() {
  const client = useTargetClient();
  const [appSlug, setAppSlug] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    data: topics,
    error: loadError,
    reload,
  } = useTargetQuery<Topic[]>(
    async (c) => {
      if (!appSlug) return [];
      const { data, error: err } = await c.rpc("list_feedback_topics", {
        app_slug: appSlug,
      });
      if (err) throw new Error(err.message);
      return (data ?? []) as Topic[];
    },
    [appSlug],
  );

  async function appId(): Promise<string | null> {
    if (!client) return null;
    const { data } = await client
      .from("apps")
      .select("id")
      .eq("slug", appSlug)
      .single();
    return (data?.id as string | undefined) ?? null;
  }

  function handleAdd() {
    const trimmed = label.trim();
    if (!trimmed || !client) return;
    setError(null);
    startTransition(async () => {
      const id = await appId();
      if (!id) return;
      const { error: err } = await client
        .from("feedbackTopics")
        .insert({ appId: id, label: trimmed });
      if (err) {
        setError(
          err.code === "23505" ? "That topic already exists." : err.message,
        );
        return;
      }
      setLabel("");
      reload();
    });
  }

  function handleRemove(id: string) {
    if (!client) return;
    setError(null);
    startTransition(async () => {
      const { error: err } = await client
        .from("feedbackTopics")
        .delete()
        .eq("id", id);
      if (err) {
        setError(
          err.code === "23503"
            ? "That topic is cited by existing feedback, so it can't be removed."
            : err.message,
        );
        return;
      }
      reload();
    });
  }

  function applyTemplate(labels: string[]) {
    if (!client) return;
    setError(null);
    startTransition(async () => {
      const id = await appId();
      if (!id) return;
      const existing = new Set(
        (topics ?? []).map((t) => t.label.toLowerCase()),
      );
      const rows = labels
        .filter((l) => !existing.has(l.toLowerCase()))
        .map((l) => ({ appId: id, label: l }));
      if (rows.length > 0) {
        const { error: err } = await client.from("feedbackTopics").insert(rows);
        if (err) {
          setError(err.message);
          return;
        }
      }
      reload();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <TargetedAppSelect value={appSlug} onChange={setAppSlug} />

      {(topics ?? []).length === 0 ? (
        <p className="text-sm text-mauve-400">
          No topics yet. An app with none still accepts feedback — the topic is
          optional.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {(topics ?? []).map((topic) => (
            <li
              key={topic.id}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1"
            >
              <span className="text-sm text-white">{topic.label}</span>
              <button
                type="button"
                onClick={() => handleRemove(topic.id)}
                disabled={isPending}
                aria-label={`Remove ${topic.label}`}
                className="text-sm text-mauve-400 transition-colors hover:text-rose-400 disabled:opacity-50"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-1.5">
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd();
          }}
          placeholder="Topic label"
          maxLength={50}
          className={inputClass}
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={isPending || !label.trim()}
          className={buttonClass}
        >
          Add topic
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {TEMPLATES.map((template) => (
          <button
            key={template.key}
            type="button"
            onClick={() => applyTemplate(template.topics)}
            disabled={isPending}
            className="rounded-sm border border-mauve-600 bg-mauve-800 px-3 py-1 text-xs text-white transition-colors hover:border-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Apply “{template.label}”
          </button>
        ))}
      </div>

      <PanelError message={error ?? loadError} />
    </div>
  );
}
