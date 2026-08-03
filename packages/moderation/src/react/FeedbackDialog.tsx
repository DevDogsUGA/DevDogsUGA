"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { submitFeedback, type ModerationClient } from "../index.js";
import { listFeedbackTopics } from "../index.js";
import type {
  BrowserMetadata,
  FeedbackSeverity,
  FeedbackTopic,
  FeedbackType,
} from "../types.js";
import {
  DialogFooter,
  DialogShell,
  classNameFor,
  type DialogClassNames,
} from "./parts.js";
import type { DialogTheme } from "./theme.js";

export interface FeedbackFormValues {
  type: FeedbackType;
  /** The chosen topic's id, or undefined when the app has no topics. */
  topicId?: string;
  severity?: FeedbackSeverity;
  title: string;
  description: string;
  browserMetadata?: BrowserMetadata;
}

export interface FeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  /** The app's slug in `platform."apps"`. Required unless `onSubmit` is given. */
  app?: string;
  /** The app's supabase-js client. Required unless `onSubmit` is given. */
  client?: ModerationClient;

  /** Dialog heading. Default "Submit Feedback". */
  title?: string;

  /**
   * Fixed topic list. Omit to load them with `listFeedbackTopics()` when the
   * dialog opens, which needs `client` and `app`.
   */
  topics?: FeedbackTopic[];

  /**
   * Replaces the default `submitFeedback()` call — for the DevDogs console
   * itself, which writes through a server action rather than PostgREST.
   */
  onSubmit?: (values: FeedbackFormValues) => Promise<void>;

  /** Collect navigator/screen/window metadata and include it. Default true. */
  collectBrowserMetadata?: boolean;

  theme?: Partial<DialogTheme>;
  classNames?: DialogClassNames;
}

const TYPE_OPTIONS: { value: FeedbackType; label: string }[] = [
  { value: "bug_report", label: "Bug Report" },
  { value: "feature_request", label: "Feature Request" },
  { value: "design_feedback", label: "Design Feedback" },
  { value: "performance", label: "Performance Issue" },
  { value: "content_issue", label: "Content Issue" },
  { value: "other", label: "Other" },
];

const SEVERITY_OPTIONS: { value: FeedbackSeverity; label: string }[] = [
  { value: "low", label: "Low — minor inconvenience" },
  { value: "medium", label: "Medium — impairs a feature" },
  { value: "high", label: "High — blocks core functionality" },
];

function collectMetadata(): BrowserMetadata {
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    screenWidth: screen.width,
    screenHeight: screen.height,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    url: window.location.href,
  };
}

export default function FeedbackDialog({
  open,
  onOpenChange,
  app,
  client,
  title = "Submit Feedback",
  topics,
  onSubmit,
  collectBrowserMetadata = true,
  theme,
  classNames = {},
}: FeedbackDialogProps) {
  const formRef = useRef<HTMLFormElement>(null);

  const [type, setType] = useState<FeedbackType | "">("");
  const [topicId, setTopicId] = useState("");
  const [severity, setSeverity] = useState<FeedbackSeverity | "">("");
  const [typeError, setTypeError] = useState(false);
  const [topicError, setTopicError] = useState(false);

  const [fetchedTopics, setFetchedTopics] = useState<FeedbackTopic[] | null>(
    null,
  );
  const [topicsLoading, setTopicsLoading] = useState(false);
  const [topicsLoadError, setTopicsLoadError] = useState<string | null>(null);

  const [isPending, setIsPending] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const resolvedTopics = topics ?? fetchedTopics ?? [];
  // An app with no topics configured still accepts feedback; the RPC takes a
  // null topic. Requiring a selection from an empty list would make the form
  // unsubmittable for exactly the apps that have not been set up yet.
  const topicRequired = resolvedTopics.length > 0;

  useEffect(() => {
    if (!open || topics) return;

    if (!client || !app) {
      setTopicsLoadError(
        "No `topics` provided, and no `client`/`app` to load them with.",
      );
      return;
    }

    let cancelled = false;
    setTopicsLoading(true);
    setTopicsLoadError(null);

    listFeedbackTopics(client, app)
      .then((res) => {
        if (!cancelled) setFetchedTopics(res);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setTopicsLoadError(
            err instanceof Error ? err.message : "Failed to load topics.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setTopicsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, topics, client, app]);

  const reset = useCallback(() => {
    setType("");
    setTopicId("");
    setSeverity("");
    setTypeError(false);
    setTopicError(false);
    setSubmitError(null);
    setSuccess(false);
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

      let valid = true;
      if (!type) {
        setTypeError(true);
        valid = false;
      }
      if (topicRequired && !topicId) {
        setTopicError(true);
        valid = false;
      }
      if (!valid) return;

      const formData = new FormData(e.currentTarget);
      const values: FeedbackFormValues = {
        type: type as FeedbackType,
        topicId: topicId || undefined,
        severity: type === "bug_report" && severity ? severity : undefined,
        title: String(formData.get("title") ?? ""),
        description: String(formData.get("description") ?? ""),
        browserMetadata: collectBrowserMetadata ? collectMetadata() : undefined,
      };

      setSubmitError(null);
      setIsPending(true);

      void (async () => {
        try {
          if (onSubmit) {
            await onSubmit(values);
          } else {
            if (!client || !app) {
              throw new Error(
                "Provide either `onSubmit`, or both `client` and `app`.",
              );
            }
            await submitFeedback(client, { app, ...values });
          }
          setSuccess(true);
          setTimeout(() => {
            reset();
            onOpenChange(false);
          }, 1500);
        } catch (err) {
          setSubmitError(
            err instanceof Error ? err.message : "Failed to submit feedback.",
          );
        } finally {
          setIsPending(false);
        }
      })();
    },
    [
      type,
      topicId,
      topicRequired,
      severity,
      collectBrowserMetadata,
      onSubmit,
      client,
      app,
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
      {success ? (
        <div className={cn("success", "devdogs-dialog__success")}>
          Thanks for the feedback!
        </div>
      ) : (
        <form
          ref={formRef}
          onSubmit={handleSubmit}
          className={cn("body", "devdogs-dialog__body")}
        >
          <div className={cn("field", "devdogs-dialog__field")}>
            <label className={cn("label", "devdogs-dialog__label")}>
              Type <span className="devdogs-dialog__required">*</span>
            </label>
            <select
              className={cn("select", "devdogs-dialog__select")}
              value={type}
              onChange={(e) => {
                setType(e.target.value as FeedbackType);
                setTypeError(false);
              }}
            >
              <option value="" disabled>
                Select a type…
              </option>
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {typeError && (
              <p className={cn("error", "devdogs-dialog__error")}>
                Please select a type.
              </p>
            )}
          </div>

          {(topicRequired || topicsLoading || topicsLoadError) && (
            <div className={cn("field", "devdogs-dialog__field")}>
              <label className={cn("label", "devdogs-dialog__label")}>
                Area <span className="devdogs-dialog__required">*</span>
              </label>
              <select
                className={cn("select", "devdogs-dialog__select")}
                value={topicId}
                disabled={topicsLoading}
                onChange={(e) => {
                  setTopicId(e.target.value);
                  setTopicError(false);
                }}
              >
                <option value="" disabled>
                  {topicsLoading ? "Loading…" : "Select an area…"}
                </option>
                {resolvedTopics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
              {topicError && (
                <p className={cn("error", "devdogs-dialog__error")}>
                  Please select an area.
                </p>
              )}
              {topicsLoadError && (
                <p className={cn("error", "devdogs-dialog__error")}>
                  {topicsLoadError}
                </p>
              )}
            </div>
          )}

          {type === "bug_report" && (
            <div className={cn("field", "devdogs-dialog__field")}>
              <label className={cn("label", "devdogs-dialog__label")}>
                Severity
              </label>
              <select
                className={cn("select", "devdogs-dialog__select")}
                value={severity}
                onChange={(e) =>
                  setSeverity(e.target.value as FeedbackSeverity | "")
                }
              >
                <option value="">Select severity…</option>
                {SEVERITY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className={cn("field", "devdogs-dialog__field")}>
            <label className={cn("label", "devdogs-dialog__label")}>
              Title <span className="devdogs-dialog__required">*</span>
            </label>
            <input
              className={cn("input", "devdogs-dialog__input")}
              name="title"
              type="text"
              placeholder="Brief summary of the issue or suggestion"
              maxLength={100}
              required
            />
          </div>

          <div className={cn("field", "devdogs-dialog__field")}>
            <label className={cn("label", "devdogs-dialog__label")}>
              Description <span className="devdogs-dialog__required">*</span>
            </label>
            <textarea
              className={cn("textarea", "devdogs-dialog__textarea")}
              name="description"
              rows={4}
              placeholder="Describe the issue or suggestion in detail. Include steps to reproduce if reporting a bug."
              minLength={10}
              required
            />
          </div>

          {submitError && (
            <p className={cn("banner", "devdogs-dialog__banner")}>
              {submitError}
            </p>
          )}

          <DialogFooter
            cn={cn}
            isPending={isPending}
            submitLabel="Submit Feedback"
            pendingLabel="Submitting…"
          />
        </form>
      )}
    </DialogShell>
  );
}
