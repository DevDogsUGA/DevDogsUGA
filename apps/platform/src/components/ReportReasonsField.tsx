"use client";

import { useState, useTransition } from "react";
import { Button } from "~/ui/button";
import { Input } from "~/ui/input";
import { Textarea } from "~/ui/textarea";
import ManageableList from "~/ui/manageable-list";
import {
  addReportReason,
  removeReportReason,
} from "~/server/actions/moderationConfig";
import type { ReasonRow } from "~/server/loaders/moderationConfig";

/**
 * Starter set offered by "Load defaults", not a fallback.
 *
 * An app with no reasons configured shows the user an empty picker rather than
 * these -- silently substituting a default list would make a forgotten
 * configuration step invisible, which is the failure mode this whole cluster is
 * built to avoid.
 */
const DEFAULT_REASONS: Array<{ title: string; description: string }> = [
  {
    title: "Harassment",
    description: "Targeted harassment or bullying of a community member",
  },
  {
    title: "Spam",
    description: "Unsolicited promotional content or repetitive posts",
  },
  {
    title: "Misinformation",
    description: "False or misleading information presented as fact",
  },
  {
    title: "Inappropriate Content",
    description: "Content that violates community guidelines",
  },
  {
    title: "Impersonation",
    description: "Pretending to be another person or organization",
  },
  { title: "Other", description: "Another reason not listed above" },
];

interface Props {
  appId: string;
  initialReasons: ReasonRow[];
  canEdit: boolean;
}

export default function ReportReasonsField({
  appId,
  initialReasons,
  canEdit,
}: Props) {
  const [reasons, setReasons] = useState(initialReasons);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!canEdit) {
    return reasons.length === 0 ? (
      <p className="text-sm text-mauve-400">
        No reasons configured for this app.
      </p>
    ) : (
      <ul className="flex flex-col gap-1.5">
        {reasons.map((reason) => (
          <li key={reason.id} className="text-sm text-white">
            {reason.title}
            {reason.description && (
              <span className="text-mauve-400"> — {reason.description}</span>
            )}
          </li>
        ))}
      </ul>
    );
  }

  function handleAdd() {
    const trimmed = title.trim();
    if (!trimmed) return;
    setError(null);
    startTransition(async () => {
      try {
        const { id } = await addReportReason(appId, trimmed, description);
        setReasons((prev) => [
          ...prev,
          { id, title: trimmed, description: description.trim() || null },
        ]);
        setTitle("");
        setDescription("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not add reason.");
      }
    });
  }

  function handleRemove(id: string) {
    setError(null);
    startTransition(async () => {
      try {
        await removeReportReason(appId, id);
        setReasons((prev) => prev.filter((r) => r.id !== id));
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Could not remove reason.",
        );
      }
    });
  }

  function handleLoadDefaults() {
    setError(null);
    const existing = new Set(reasons.map((r) => r.title.toLowerCase()));
    const missing = DEFAULT_REASONS.filter(
      (r) => !existing.has(r.title.toLowerCase()),
    );
    if (missing.length === 0) return;

    startTransition(async () => {
      try {
        // Sequential rather than Promise.all: each insert is its own server
        // action, and a partial failure should leave the list showing exactly
        // what landed rather than an optimistic guess.
        for (const reason of missing) {
          const { id } = await addReportReason(
            appId,
            reason.title,
            reason.description,
          );
          setReasons((prev) => [
            ...prev,
            { id, title: reason.title, description: reason.description },
          ]);
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Could not load defaults.",
        );
      }
    });
  }

  return (
    <ManageableList
      items={reasons}
      onRemove={handleRemove}
      isPending={isPending}
      error={error}
      emptyLabel="No reasons yet."
      renderItem={(reason, onRemove) => (
        <div
          key={reason.id}
          className="flex items-start justify-between gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2"
        >
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-white">
              {reason.title}
            </span>
            {reason.description && (
              <span className="text-xs text-mauve-400">
                {reason.description}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onRemove}
            disabled={isPending}
            aria-label={`Remove ${reason.title}`}
            className="mt-0.5 shrink-0 text-sm text-mauve-400 transition-colors hover:text-rose-400 disabled:opacity-50"
          >
            ×
          </button>
        </div>
      )}
      addForm={
        <div className="flex max-w-sm flex-col gap-1.5">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
            }}
            placeholder="Reason title"
            maxLength={100}
          />
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            rows={2}
          />
          <Button
            type="button"
            variant="secondary"
            className="self-start"
            onClick={handleAdd}
            disabled={isPending || !title.trim()}
          >
            Add reason
          </Button>
        </div>
      }
      actions={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={handleLoadDefaults}
          disabled={isPending}
        >
          Load defaults
        </Button>
      }
    />
  );
}
