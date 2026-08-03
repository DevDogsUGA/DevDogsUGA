"use client";

import { useState, useTransition } from "react";
import ReportActionForm from "~/components/ReportActionForm";
import TargetedAppSelect from "./TargetedAppSelect";
import {
  PanelError,
  TargetGate,
  useTargetClient,
  useTargetQuery,
} from "./panels";

interface TargetReport {
  id: string;
  contentType: string;
  contentRef: string;
  contentSnapshot: string;
  status: "open" | "resolved" | "dismissed";
  createdAt: string;
  reportReasons: { title: string } | null;
}

/**
 * The moderation queue on the targeted instance.
 *
 * Acting on a report goes through `platform.resolve_report()` — the same
 * function the console's server action calls. That is the point: the workflow
 * has one implementation, and this panel supplies a different transport rather
 * than a second copy of the rules. The console additionally applies Supabase's
 * native ban, which a browser has no credentials for; a report resolved from
 * here still records the decision and the suspension, which is what every app's
 * write policies actually consult.
 */
export default function ReportsPanel() {
  return (
    <TargetGate>
      <Inner />
    </TargetGate>
  );
}

function Inner() {
  const client = useTargetClient();
  const [appSlug, setAppSlug] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    data: reports,
    error: loadError,
    reload,
  } = useTargetQuery<TargetReport[]>(
    async (c) => {
      if (!appSlug) return [];
      const { data: app } = await c
        .from("apps")
        .select("id")
        .eq("slug", appSlug)
        .single();
      if (!app) return [];
      const { data, error: err } = await c
        .from("reports")
        .select(
          "id, contentType, contentRef, contentSnapshot, status, createdAt, reportReasons(title)",
        )
        .eq("appId", app.id)
        .order("createdAt", { ascending: false });
      if (err) throw new Error(err.message);
      return (data ?? []) as unknown as TargetReport[];
    },
    [appSlug],
  );

  function act(fn: () => Promise<{ error: { message: string } | null }>) {
    setError(null);
    startTransition(async () => {
      const { error: err } = await fn();
      if (err) {
        setError(err.message);
        return;
      }
      setOpenId(null);
      reload();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <TargetedAppSelect value={appSlug} onChange={setAppSlug} />

      {(reports ?? []).length === 0 ? (
        <p className="text-sm text-mauve-400">
          No reports. File one from your app with{" "}
          <code>platform.file_report()</code>, or through{" "}
          <code>&lt;ReportDialog&gt;</code>.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {(reports ?? []).map((report) => (
            <li
              key={report.id}
              className="flex flex-col gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-white">
                  {report.reportReasons?.title ?? "(reason removed)"}
                </span>
                <code className="text-xs text-mauve-400">
                  {report.contentType}/{report.contentRef.slice(0, 8)}
                </code>
                <span
                  className={
                    report.status === "open"
                      ? "rounded-sm bg-rose-400/15 px-1.5 py-0.5 text-[0.65rem] text-rose-300"
                      : "rounded-sm bg-white/10 px-1.5 py-0.5 text-[0.65rem] text-mauve-300"
                  }
                >
                  {report.status}
                </span>
              </div>

              {/* Frozen at filing time, so this is what was reported even if
                  the content has since changed or been deleted. */}
              <p className="line-clamp-3 text-xs whitespace-pre-wrap text-mauve-300">
                {report.contentSnapshot}
              </p>

              {report.status === "open" &&
                (openId === report.id ? (
                  <ReportActionForm
                    reportId={report.id}
                    quarantinable
                    onResolve={(args) =>
                      act(async () => {
                        if (!client) return { error: null };
                        return client.rpc("resolve_report", {
                          report_id: report.id,
                          subject_action: args.subjectAction,
                          filer_action: args.filerAction,
                          content_action: args.contentAction,
                          moderator_note: args.note ?? null,
                          apply_globally: args.applyGlobally,
                        });
                      })
                    }
                    onDismiss={(note) =>
                      act(async () => {
                        if (!client) return { error: null };
                        return client.rpc("dismiss_report", {
                          report_id: report.id,
                          moderator_note: note ?? null,
                        });
                      })
                    }
                    disabled={isPending}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setOpenId(report.id)}
                    className="self-start rounded-sm border border-mauve-600 bg-mauve-800 px-3 py-1 text-xs text-white transition-colors hover:border-white"
                  >
                    Act on this
                  </button>
                ))}
            </li>
          ))}
        </ul>
      )}

      <PanelError message={error ?? loadError} />
    </div>
  );
}
