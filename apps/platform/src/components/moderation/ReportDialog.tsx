"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { callRpc, type ModerationClient } from "./rpc";
import type { ReportReason } from "./types";
import {
  DialogFooter,
  DialogShell,
  classNameFor,
  type DialogClassNames,
} from "./parts";
import type { DialogTheme } from "./theme";

export interface ReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  /** The app's slug in `platform."apps"`. */
  app: string;
  /** The app's supabase-js client. */
  client: ModerationClient;

  /** The content type, as `list_content_types` reports it. */
  contentType: string;
  /** The content row's primary key, stringified. */
  contentRef: string;

  /** Dialog heading. Default "Report Content". */
  title?: string;

  /**
   * Fixed reason list. Omit to load them with `listReportReasons()` when the
   * dialog opens.
   */
  reasons?: ReportReason[];

  /**
   * Called after a successful filing. `corroborated` is true when the content
   * already had an open report and this reporter was recorded as agreeing with
   * it — worth telling the user, since "someone already reported this" reads
   * very differently from "thanks, we'll take a look".
   */
  onFiled?: (result: { reportId: string; corroborated: boolean }) => void;

  theme?: Partial<DialogTheme>;
  classNames?: DialogClassNames;
}

/**
 * Reports a piece of content to DevDogs moderation.
 *
 * Note what this component never sees: who authored the content, or what it
 * says. `file_report` reads both from the content itself, so there is nothing
 * here for a tampered client to falsify. All the form collects is which reason
 * applies and, optionally, why.
 */
export default function ReportDialog({
  open,
  onOpenChange,
  app,
  client,
  contentType,
  contentRef,
  title = "Report Content",
  reasons,
  onFiled,
  theme,
  classNames = {},
}: ReportDialogProps) {
  const formRef = useRef<HTMLFormElement>(null);

  const [reasonId, setReasonId] = useState("");
  const [reasonError, setReasonError] = useState(false);

  const [fetchedReasons, setFetchedReasons] = useState<ReportReason[] | null>(
    null,
  );
  const [reasonsLoading, setReasonsLoading] = useState(false);
  const [reasonsLoadError, setReasonsLoadError] = useState<string | null>(null);

  const [isPending, setIsPending] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [corroborated, setCorroborated] = useState<boolean | null>(null);

  const resolvedReasons = reasons ?? fetchedReasons ?? [];
  const selected = resolvedReasons.find((r) => r.id === reasonId);

  useEffect(() => {
    if (!open || reasons) return;

    let cancelled = false;
    setReasonsLoading(true);
    setReasonsLoadError(null);

    callRpc(client, "list_report_reasons", { app_slug: app })
      .then((res) => {
        if (!cancelled) setFetchedReasons(res ?? []);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setReasonsLoadError(
            err instanceof Error ? err.message : "Failed to load reasons.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setReasonsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, reasons, client, app]);

  const reset = useCallback(() => {
    setReasonId("");
    setReasonError(false);
    setSubmitError(null);
    setCorroborated(null);
    formRef.current?.reset();
  }, []);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (isPending) return;
      if (!next) reset();
      onOpenChange(next);
    },
    [isPending, reset, onOpenChange],
  );

  const handleSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();

      if (!reasonId) {
        setReasonError(true);
        return;
      }

      const formData = new FormData(e.currentTarget);
      const description = String(formData.get("description") ?? "").trim();

      setSubmitError(null);
      setIsPending(true);

      void (async () => {
        try {
          // A one-element array: `file_report` is `returns table`, so
          // PostgREST serialises its single row as a list like any other set.
          const rows = await callRpc(client, "file_report", {
            app_slug: app,
            content_type: contentType,
            content_ref: contentRef,
            reason_id: reasonId,
            description: description || undefined,
          });
          const result = rows[0];
          if (!result) throw new Error("file_report returned no rows");
          setCorroborated(result.corroborated);
          onFiled?.(result);
          setTimeout(() => {
            reset();
            onOpenChange(false);
          }, 2000);
        } catch (err) {
          setSubmitError(
            err instanceof Error ? err.message : "Failed to file the report.",
          );
        } finally {
          setIsPending(false);
        }
      })();
    },
    [
      reasonId,
      client,
      app,
      contentType,
      contentRef,
      onFiled,
      reset,
      onOpenChange,
    ],
  );

  const cn = classNameFor(classNames);

  return (
    <DialogShell
      open={open}
      onOpenChange={handleOpenChange}
      title={title}
      isPending={isPending}
      theme={theme}
      classNames={classNames}
    >
      {corroborated !== null ? (
        <div className={cn("success", "devdogs-dialog__success")}>
          {corroborated
            ? "Someone had already reported this. We've noted that you agree."
            : "Thanks — this has been sent to the moderators."}
        </div>
      ) : (
        <form
          ref={formRef}
          onSubmit={handleSubmit}
          className={cn("body", "devdogs-dialog__body")}
        >
          <div className={cn("field", "devdogs-dialog__field")}>
            <label className={cn("label", "devdogs-dialog__label")}>
              Reason <span className="devdogs-dialog__required">*</span>
            </label>
            <select
              className={cn("select", "devdogs-dialog__select")}
              value={reasonId}
              disabled={reasonsLoading}
              onChange={(e) => {
                setReasonId(e.target.value);
                setReasonError(false);
              }}
            >
              <option value="" disabled>
                {reasonsLoading ? "Loading…" : "Select a reason…"}
              </option>
              {resolvedReasons.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                </option>
              ))}
            </select>
            {selected?.description && (
              <p className={cn("hint", "devdogs-dialog__hint")}>
                {selected.description}
              </p>
            )}
            {reasonError && (
              <p className={cn("error", "devdogs-dialog__error")}>
                Please select a reason.
              </p>
            )}
            {reasonsLoadError && (
              <p className={cn("error", "devdogs-dialog__error")}>
                {reasonsLoadError}
              </p>
            )}
          </div>

          <div className={cn("field", "devdogs-dialog__field")}>
            <label className={cn("label", "devdogs-dialog__label")}>
              Anything else? (optional)
            </label>
            <textarea
              className={cn("textarea", "devdogs-dialog__textarea")}
              name="description"
              rows={3}
              maxLength={1000}
              placeholder="Context that would help a moderator understand the problem."
            />
            <p className={cn("hint", "devdogs-dialog__hint")}>
              A copy of the content is attached automatically, so there is no
              need to quote it.
            </p>
          </div>

          {submitError && (
            <p className={cn("banner", "devdogs-dialog__banner")}>
              {submitError}
            </p>
          )}

          <DialogFooter
            cn={cn}
            isPending={isPending}
            submitLabel="Submit Report"
            pendingLabel="Submitting…"
          />
        </form>
      )}
    </DialogShell>
  );
}
