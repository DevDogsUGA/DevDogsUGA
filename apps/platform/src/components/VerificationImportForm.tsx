"use client";

import { useRef, useState, useTransition } from "react";
import { uploadVerificationCSV } from "~/server/actions/verification";
import FormButton from "~/components/FormButton";

export default function VerificationImportForm() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    created?: number;
    updated?: number;
    error?: string;
  } | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = inputRef.current?.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.set("csv", file);

    startTransition(async () => {
      const res = await uploadVerificationCSV(formData);
      setResult(res);
      if (!res.error && inputRef.current) {
        inputRef.current.value = "";
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        required
        className="block w-full max-w-sm rounded-sm border border-mauve-600 bg-mauve-800 px-3 py-2 text-sm text-white file:mr-3 file:rounded-sm file:border-0 file:bg-mauve-700 file:px-3 file:py-1 file:text-sm file:font-medium file:text-white hover:file:bg-mauve-600"
      />
      <div className="flex items-center gap-4">
        <FormButton type="submit" theme="black" disabled={isPending}>
          {isPending ? "Importing…" : "Import Roster"}
        </FormButton>
        {result && !result.error && (
          <p className="text-sm text-emerald-400">
            Done — {result.created} member{result.created !== 1 ? "s" : ""}{" "}
            created, {result.updated} updated.
          </p>
        )}
        {result?.error && (
          <p className="text-sm text-rose-400">{result.error}</p>
        )}
      </div>
    </form>
  );
}
