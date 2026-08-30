"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { callRpc, type ModerationClient } from "./rpc";
import type { ReportReason, ReportReasonValue } from "./types";
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
   * it. Worth telling the user, since "someone already reported this" reads
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

  const [reason, setReason] = useState<ReportReasonValue | "">("");
  const [reasonError, setReasonError] = useState(false);
  const [descriptionError, setDescriptionError] = useState(false);

  /**
   * One state for the fetch, and `loading` derived rather than stored.
   *
   * This was three pieces of state, which forced `setReasonsLoading(true)` and
   * `setReasonsLoadError(null)` to run SYNCHRONOUSLY inside the effect. That
   * schedules a second render before the request has started, which is what
   * `react-hooks/set-state-in-effect` is pointing at.
   *
   * Loading is not independent information: it is exactly "we need the reasons
   * and do not have them yet". Deriving it makes that unrepresentable-wrong and
   * leaves the effect setting state only from its async callbacks.
   */
  const [fetched, setFetched] = useState<
    { reasons: ReportReason[] } | { error: string } | null
  >(null);

  // `reasons` supplied by the caller means there is nothing to fetch at all.
  const needsFetch = open && !reasons;
  const reasonsLoading = needsFetch && fetched === null;
  const reasonsLoadError = fetched && "error" in fetched ? fetched.error : null;
  const fetchedReasons =
    fetched && "reasons" in fetched ? fetched.reasons : null;

  const [isPending, setIsPending] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [corroborated, setCorroborated] = useState<boolean | null>(null);

  const resolvedReasons = reasons ?? fetchedReasons ?? [];
  const selected = resolvedReasons.find((r) => r.reason === reason);

  useEffect(() => {
    if (!needsFetch) return;

    let cancelled = false;

    callRpc(client, "list_report_reasons")
      .then((res) => {
        if (!cancelled) setFetched({ reasons: res ?? [] });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setFetched({
            error:
              err instanceof Error ? err.message : "Failed to load reasons.",
          });
        }
      });

    return () => {
      cancelled = true;
    };
    // `app` was in the dependency list but is not read here; the effect
    // re-running on an app change fetched the same global vocabulary again.
  }, [needsFetch, client]);

  const reset = useCallback(() => {
    setReason("");
    setReasonError(false);
    setDescriptionError(false);
    setSubmitError(null);
    setCorroborated(null);
    // Discards a failed fetch so reopening retries clean rather than showing
    // the previous error while the new request is in flight. The old effect got
    // this by listing `open` and clearing the error on every run; a handler
    // does the same without setting state synchronously in an effect.
    setFetched(null);
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

      if (!reason) {
        setReasonError(true);
        return;
      }

      const formData = new FormData(e.currentTarget);
      // `FormData.get` returns `string | File | null`, so the old
      // `String(... ?? "")` would render a File as "[object File]" and submit
      // that as the description. Narrowing instead of coercing treats a
      // non-string as no description at all, which the `other` check below
      // then catches.
      const raw = formData.get("description");
      const description = typeof raw === "string" ? raw.trim() : "";

      // Mirrors the rule inside file_report, which is where it is enforced.
      // 'other' is the catch-all, and a catch-all with no sentence attached is
      // something a moderator can only dismiss. Checking here turns a
      // round-trip error into inline feedback.
      if (reason === "other" && !description) {
        setDescriptionError(true);
        return;
      }

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
            reason,
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
      reason,
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
              value={reason}
              disabled={reasonsLoading}
              onChange={(e) => {
                setReason(e.target.value as ReportReasonValue);
                setReasonError(false);
                setDescriptionError(false);
              }}
            >
              <option value="" disabled>
                {reasonsLoading ? "Loading…" : "Select a reason…"}
              </option>
              {resolvedReasons.map((r) => (
                <option key={r.reason} value={r.reason}>
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
              {reason === "other" ? (
                <>
                  What happened?{" "}
                  <span className="devdogs-dialog__required">*</span>
                </>
              ) : (
                "Anything else? (optional)"
              )}
            </label>
            <textarea
              className={cn("textarea", "devdogs-dialog__textarea")}
              name="description"
              rows={3}
              maxLength={1000}
              placeholder="Context that would help a moderator understand the problem."
              onChange={() => setDescriptionError(false)}
            />
            {descriptionError ? (
              <p className={cn("error", "devdogs-dialog__error")}>
                Please describe the problem — &ldquo;Something else&rdquo; gives
                a moderator nothing to act on by itself.
              </p>
            ) : (
              <p className={cn("hint", "devdogs-dialog__hint")}>
                A copy of the content is attached automatically, so there is no
                need to quote it.
              </p>
            )}
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
