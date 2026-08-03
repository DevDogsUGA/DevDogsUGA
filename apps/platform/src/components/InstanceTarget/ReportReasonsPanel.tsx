"use client";

import { useState, useTransition } from "react";
import type { ReportReason } from "@devdogsuga/moderation";
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

interface Reason extends ReportReason {
  appId: string;
}

/**
 * Report reasons for an app on the targeted instance.
 *
 * Writes go straight to the table rather than through an RPC: `reportReasons`
 * carries permissive policies gated on `canModerate`, so RLS is already the
 * authorization, and there is nothing a server-side wrapper would add. Contrast
 * `reports`, where the client is denied INSERT outright because filing one
 * involves reading the content it names.
 */
export default function ReportReasonsPanel() {
  return (
    <TargetGate>
      <Inner />
    </TargetGate>
  );
}

function Inner() {
  const client = useTargetClient();
  const [appSlug, setAppSlug] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    data: reasons,
    error: loadError,
    reload,
  } = useTargetQuery<Reason[]>(
    async (c) => {
      if (!appSlug) return [];
      const { data: app } = await c
        .from("apps")
        .select("id")
        .eq("slug", appSlug)
        .single();
      if (!app) return [];
      const { data, error: err } = await c
        .from("reportReasons")
        .select("id, appId, title, description")
        .eq("appId", app.id)
        .order("title");
      if (err) throw new Error(err.message);
      return (data ?? []) as Reason[];
    },
    [appSlug],
  );

  function handleAdd() {
    const trimmed = title.trim();
    if (!trimmed || !client) return;
    setError(null);
    startTransition(async () => {
      const { data: app } = await client
        .from("apps")
        .select("id")
        .eq("slug", appSlug)
        .single();
      if (!app) return;
      const { error: err } = await client.from("reportReasons").insert({
        appId: app.id,
        title: trimmed,
        description: description.trim() || null,
      });
      if (err) {
        setError(
          err.code === "23505"
            ? "A reason with that title already exists for this app."
            : err.message,
        );
        return;
      }
      setTitle("");
      setDescription("");
      reload();
    });
  }

  function handleRemove(id: string) {
    if (!client) return;
    setError(null);
    startTransition(async () => {
      const { error: err } = await client
        .from("reportReasons")
        .delete()
        .eq("id", id);
      if (err) {
        setError(
          // A reason that a report already cites is protected by `on delete
          // restrict`, so history cannot be rewritten by deleting the reason
          // out from under it.
          err.code === "23503"
            ? "That reason is cited by an existing report, so it can't be removed."
            : err.message,
        );
        return;
      }
      reload();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <TargetedAppSelect value={appSlug} onChange={setAppSlug} />

      {(reasons ?? []).length === 0 ? (
        <p className="text-sm text-mauve-400">No reasons yet.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {(reasons ?? []).map((reason) => (
            <li
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
                onClick={() => handleRemove(reason.id)}
                disabled={isPending}
                aria-label={`Remove ${reason.title}`}
                className="mt-0.5 shrink-0 text-sm text-mauve-400 transition-colors hover:text-rose-400 disabled:opacity-50"
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
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd();
          }}
          placeholder="Reason title"
          maxLength={100}
          className={inputClass}
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          rows={2}
          className={`${inputClass} resize-none`}
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={isPending || !title.trim()}
          className={buttonClass}
        >
          Add reason
        </button>
      </div>

      <PanelError message={error ?? loadError} />
    </div>
  );
}
