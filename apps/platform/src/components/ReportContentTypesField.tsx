"use client";

import { useEffect, useState, useTransition } from "react";
import { createClient } from "~/supabase/client";

interface ContentType {
  id: string;
  label: string;
}

const DEFAULT_CONTENT_TYPES = ["Post", "Comment", "Profile", "Resource", "Message"];

interface Props {
  clientId: string;
}

export default function ReportContentTypesField({ clientId }: Props) {
  const supabase = createClient();
  const [contentTypes, setContentTypes] = useState<ContentType[]>([]);
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function fetchContentTypes() {
    const { data } = await supabase
      .from("reportContentTypes")
      .select("id, label")
      .eq("clientId", clientId)
      .order("createdAt", { ascending: true });
    if (data) setContentTypes(data);
  }

  useEffect(() => {
    void fetchContentTypes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  function handleAdd() {
    const trimmed = label.trim();
    if (!trimmed) return;
    setError(null);
    startTransition(async () => {
      const { error: err } = await supabase.from("reportContentTypes").insert({
        clientId,
        label: trimmed,
      });
      if (err) {
        setError(err.code === "23505" ? "A content type with that label already exists." : err.message);
        return;
      }
      setLabel("");
      await fetchContentTypes();
    });
  }

  function handleRemove(id: string) {
    setError(null);
    startTransition(async () => {
      await supabase.from("reportContentTypes").delete().eq("id", id);
      await fetchContentTypes();
    });
  }

  function handleLoadDefaults() {
    setError(null);
    startTransition(async () => {
      const existing = new Set(contentTypes.map((ct) => ct.label.toLowerCase()));
      const toInsert = DEFAULT_CONTENT_TYPES.filter(
        (l) => !existing.has(l.toLowerCase()),
      ).map((l) => ({ clientId, label: l }));
      if (toInsert.length > 0) {
        const { error: err } = await supabase.from("reportContentTypes").insert(toInsert);
        if (err) { setError(err.message); return; }
      }
      await fetchContentTypes();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {contentTypes.length === 0 ? (
          <p className="text-sm text-mauve-400">No content types yet.</p>
        ) : (
          contentTypes.map((ct) => (
            <span
              key={ct.id}
              className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80"
            >
              {ct.label}
              <button
                type="button"
                onClick={() => handleRemove(ct.id)}
                disabled={isPending}
                aria-label={`Remove ${ct.label}`}
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
          onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
          placeholder="New content type"
          maxLength={100}
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
