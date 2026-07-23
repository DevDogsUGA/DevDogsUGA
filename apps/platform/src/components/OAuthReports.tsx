"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { dismissReport, resolveReport } from "~/server/actions/moderation";
import FormButton from "./FormButton";

export interface DevReport {
  id: string;
  contentId: string;
  contentTypeLabel: string | null;
  contentSnapshot: string;
  contentUrl: string | null;
  reasonTitle: string | null;
  description: string | null;
  reporterUserId: string;
  reportedUserId: string;
  createdAt: string;
  corroborationCount: number;
}

interface Props {
  reports: DevReport[];
}

const SELECT_CLASS =
  "rounded-sm border border-mauve-600 bg-mauve-800 px-2 py-1.5 text-sm text-white outline-none focus:border-white";

function ReportRow({ report }: { report: DevReport }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const [localDeliveryError, setLocalDeliveryError] = useState<string | null>(
    null,
  );

  function handleResolve(formData: FormData) {
    const subjectAction = formData.get("subjectAction") as
      | "warn"
      | "suspend"
      | "ban"
      | "no_action";
    const filerAction = formData.get("filerAction") as
      | "warn"
      | "suspend"
      | "no_action";
    const contentAction = formData.get("contentAction") as
      | "quarantine"
      | "no_action";
    const note = (formData.get("note") as string) || undefined;

    setLocalDeliveryError(null);
    startTransition(async () => {
      const payload = await resolveReport(
        report.id,
        subjectAction,
        filerAction,
        contentAction,
        note,
        false,
      );
      const localUrl = localStorage.getItem("devdogs:localServerUrl");
      if (localUrl && payload) {
        try {
          const res = await fetch(localUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (!res.ok)
            setLocalDeliveryError(`Local server returned ${res.status}`);
        } catch (e) {
          setLocalDeliveryError(
            e instanceof Error ? e.message : "Failed to reach local server",
          );
        }
      }
      router.refresh();
    });
  }

  function handleDismiss() {
    startTransition(async () => {
      await dismissReport(report.id);
      router.refresh();
    });
  }

  return (
    <li className="rounded-xl border border-white/10 bg-white/5 transition-colors hover:border-white/20 hover:bg-white/10">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-sm text-white/80">
            {report.contentTypeLabel ? `${report.contentTypeLabel}: ` : ""}
            {report.contentId}
          </span>
          <span className="text-xs text-mauve-400">
            {report.reasonTitle ?? "Unknown reason"} ·{" "}
            {new Date(report.createdAt).toLocaleDateString()}
            {report.corroborationCount > 0 &&
              ` · +${report.corroborationCount} corroboration${report.corroborationCount !== 1 ? "s" : ""}`}
          </span>
        </div>
        <span className="text-mauve-400">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="border-t border-white/10 px-4 pt-3 pb-4">
          <pre className="mb-3 rounded-lg border border-white/10 bg-mauve-950 p-2 font-mono text-xs whitespace-pre-wrap text-mauve-200">
            {report.contentSnapshot}
          </pre>

          {report.contentUrl && (
            <a
              href={report.contentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mb-3 block text-xs text-blue-400 hover:text-blue-300"
            >
              View live →
            </a>
          )}

          {report.description && (
            <p className="mb-3 text-xs text-white/70">
              &ldquo;{report.description}&rdquo;
            </p>
          )}

          <form action={handleResolve} className="flex flex-col gap-3">
            <div className="grid grid-cols-3 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-mauve-400">Subject action</span>
                <select
                  name="subjectAction"
                  className={SELECT_CLASS}
                  defaultValue="no_action"
                >
                  <option value="no_action">No action</option>
                  <option value="warn">Warn</option>
                  <option value="suspend">Suspend</option>
                  <option value="ban">Ban</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-mauve-400">Filer action</span>
                <select
                  name="filerAction"
                  className={SELECT_CLASS}
                  defaultValue="no_action"
                >
                  <option value="no_action">No action</option>
                  <option value="warn">Warn</option>
                  <option value="suspend">Suspend</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-mauve-400">Content action</span>
                <select
                  name="contentAction"
                  className={SELECT_CLASS}
                  defaultValue="no_action"
                >
                  <option value="no_action">No action</option>
                  <option value="quarantine">Quarantine</option>
                </select>
              </label>
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-mauve-400">Note (internal)</span>
              <input
                name="note"
                type="text"
                className="rounded-sm border border-mauve-600 bg-mauve-800 px-2 py-1.5 text-sm text-white outline-none placeholder:text-mauve-500 focus:border-white"
                placeholder="Optional"
              />
            </label>

            <div className="flex flex-col gap-1.5">
              <div className="flex gap-2">
                <FormButton
                  type="submit"
                  disabled={isPending}
                  className="text-sm"
                  theme="black"
                >
                  Resolve
                </FormButton>
                <button
                  type="button"
                  disabled={isPending}
                  className="rounded-sm border border-mauve-600 bg-mauve-800 px-4 py-1.5 text-sm text-white transition-colors hover:border-white disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={handleDismiss}
                >
                  Dismiss
                </button>
              </div>
              {localDeliveryError && (
                <p className="text-xs text-rose-400">
                  Local server: {localDeliveryError}
                </p>
              )}
            </div>
          </form>
        </div>
      )}
    </li>
  );
}

export default function OAuthReports({ reports }: Props) {
  if (reports.length === 0) {
    return (
      <p className="text-sm text-mauve-400">
        No pending reports from test users.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {reports.map((report) => (
        <ReportRow key={report.id} report={report} />
      ))}
    </ul>
  );
}
