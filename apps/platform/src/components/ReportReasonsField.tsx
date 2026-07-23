"use client";

import { useEffect, useState, useTransition } from "react";
import { createClient } from "~/supabase/client";

interface Reason {
  id: string;
  title: string;
  description: string | null;
}

const DEFAULT_REASONS: Array<{ title: string; description: string }> = [
  { title: "Harassment", description: "Targeted harassment or bullying of a community member" },
  { title: "Spam", description: "Unsolicited promotional content or repetitive posts" },
  { title: "Misinformation", description: "False or misleading information presented as fact" },
  { title: "Inappropriate Content", description: "Content that violates community guidelines" },
  { title: "Impersonation", description: "Pretending to be another person or organization" },
  { title: "Other", description: "Another reason not listed above" },
];

interface Props {
  clientId: string;
}

export default function ReportReasonsField({ clientId }: Props) {
  const supabase = createClient();
  const [reasons, setReasons] = useState<Reason[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function fetchReasons() {
    const { data } = await supabase
      .from("reportReasons")
      .select("id, title, description")
      .eq("clientId", clientId)
      .order("createdAt", { ascending: true });
    if (data) setReasons(data);
  }

  useEffect(() => {
    void fetchReasons();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  function handleAdd() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    setError(null);
    startTransition(async () => {
      const { error: err } = await supabase.from("reportReasons").insert({
        clientId,
        title: trimmedTitle,
        description: description.trim() || null,
      });
      if (err) {
        setError(err.code === "23505" ? "A reason with that title already exists." : err.message);
        return;
      }
      setTitle("");
      setDescription("");
      await fetchReasons();
    });
  }

  function handleRemove(id: string) {
    setError(null);
    startTransition(async () => {
      await supabase.from("reportReasons").delete().eq("id", id);
      await fetchReasons();
    });
  }

  function handleLoadDefaults() {
    setError(null);
    startTransition(async () => {
      const existing = new Set(reasons.map((r) => r.title.toLowerCase()));
      const toInsert = DEFAULT_REASONS.filter(
        (r) => !existing.has(r.title.toLowerCase()),
      ).map((r) => ({ clientId, title: r.title, description: r.description }));
      if (toInsert.length > 0) {
        const { error: err } = await supabase.from("reportReasons").insert(toInsert);
        if (err) { setError(err.message); return; }
      }
      await fetchReasons();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {reasons.length === 0 ? (
        <p className="text-sm text-mauve-400">No reasons yet.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {reasons.map((reason) => (
            <li
              key={reason.id}
              className="flex items-start justify-between gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2"
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-white">{reason.title}</span>
                {reason.description && (
                  <span className="text-xs text-mauve-400">{reason.description}</span>
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
          onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
          placeholder="Reason title"
          maxLength={100}
          className="max-w-sm rounded-sm border border-mauve-600 bg-mauve-800 px-2 py-1.5 text-sm text-white outline-none placeholder:text-mauve-500 focus:border-white"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          rows={2}
          className="max-w-sm resize-none rounded-sm border border-mauve-600 bg-mauve-800 px-2 py-1.5 text-sm text-white outline-none placeholder:text-mauve-500 focus:border-white"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={isPending || !title.trim()}
          className="self-start rounded-sm border border-mauve-600 bg-mauve-800 px-3 py-1.5 text-sm text-white transition-colors hover:border-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          Add reason
        </button>
      </div>

      {error && <p className="text-xs text-rose-400">{error}</p>}

      <button
        type="button"
        onClick={handleLoadDefaults}
        disabled={isPending}
        className="self-start rounded-sm border border-mauve-600 bg-mauve-800 px-3 py-1 text-xs text-white transition-colors hover:border-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        Load defaults
      </button>
    </div>
  );
}
