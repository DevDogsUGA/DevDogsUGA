"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type FormEvent } from "react";
import { dismissReport, resolveReport } from "~/server/actions/moderation";
import { Panel } from "~/ui/app-shell";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "~/ui/alert-dialog";
import { Button } from "~/ui/button";
import { Checkbox } from "~/ui/checkbox";
import Field from "~/ui/field";
import { Textarea } from "~/ui/textarea";

export interface ResolveArgs {
  subjectAction: "warn" | "suspend" | "ban" | "no_action";
  filerAction: "warn" | "suspend" | "no_action";
  contentAction: "quarantine" | "no_action";
  note?: string;
  applyGlobally: boolean;
}

interface Props {
  reportId: string;
  /**
   * Whether this report's content type supports quarantine, meaning its table
   * carries the foreign key to `platform."reportResolutions"`.
   *
   * `apply_content_action` raises when it does not, aborting the whole
   * resolution, so hiding the option here keeps a moderator from losing their
   * work to a decision the database was always going to refuse.
   */
  quarantinable: boolean;
  returnTo?: string;
  /**
   * Overrides the default server-action transport.
   *
   * The console resolves reports on this instance through a server action; the
   * contributor tooling resolves them on a *different* instance through
   * `platform.resolve_report()` from the browser. Both end up in the same SQL
   * function, so this is a transport seam, not a second implementation. The
   * previous attempt at this was a whole duplicate component, and it drifted.
   */
  onResolve?: (args: ResolveArgs) => void;
  onDismiss?: (note?: string) => void;
  disabled?: boolean;
}

export default function ReportActionForm({
  reportId,
  quarantinable,
  returnTo = "/dashboard/moderation",
  onResolve,
  onDismiss,
  disabled = false,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const busy = isPending || disabled;

  function readArgs(formData: FormData): ResolveArgs {
    return {
      subjectAction: formData.get(
        "subjectAction",
      ) as ResolveArgs["subjectAction"],
      filerAction: formData.get("filerAction") as ResolveArgs["filerAction"],
      contentAction: formData.get(
        "contentAction",
      ) as ResolveArgs["contentAction"],
      note: (formData.get("note") as string) || undefined,
      applyGlobally: formData.get("applyGlobally") === "on",
    };
  }

  function handleResolve(formData: FormData) {
    const args = readArgs(formData);

    if (onResolve) {
      onResolve(args);
      return;
    }

    startTransition(async () => {
      await resolveReport(
        reportId,
        args.subjectAction,
        args.filerAction,
        args.contentAction,
        args.note,
        args.applyGlobally,
      );
      router.push(returnTo);
      router.refresh();
    });
  }

  function handleDismiss(note?: string) {
    if (onDismiss) {
      onDismiss(note);
      return;
    }

    startTransition(async () => {
      await dismissReport(reportId, note);
      router.push(returnTo);
      router.refresh();
    });
  }

  const formId = `resolve-form-${reportId}`;
  const [confirm, setConfirm] = useState<null | "ban" | "suspend" | "dismiss">(
    null,
  );
  const pendingArgs = useRef<FormData | null>(null);
  const pendingNote = useRef<string | undefined>(undefined);

  function noteOf(form: HTMLFormElement) {
    const note = new FormData(form).get("note");
    // An empty textarea is no note. Written as a comparison rather than
    // `note || undefined` because `??` is NOT the right fix here: `""` is not
    // nullish, so nullish coalescing would keep the empty string and send it
    // as a real note.
    return typeof note === "string" && note !== "" ? note : undefined;
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const subject = data.get("subjectAction");
    if (subject === "ban" || subject === "suspend") {
      pendingArgs.current = data;
      setConfirm(subject);
      return;
    }
    handleResolve(data);
  }

  function runConfirmed() {
    if (confirm === "dismiss") handleDismiss(pendingNote.current);
    else if (pendingArgs.current) handleResolve(pendingArgs.current);
    setConfirm(null);
  }

  const copy = {
    ban: {
      title: "Ban the reported user?",
      body: "They lose access to every app that uses DevDogs sign-in, and the reporting app is told to remove the reported content. Their other reports stay open. The decision is written to the audit log and sent to the app.",
      action: "Ban and resolve",
    },
    suspend: {
      title: "Suspend the reported user?",
      body: "A suspension blocks them from the apps until you lift it on their standing page. It applies to the reporting app only unless Apply globally is on.",
      action: "Suspend and resolve",
    },
    dismiss: {
      title: "Dismiss this report?",
      body: "No action is taken against anyone. The reporter is told it was reviewed. You can't reopen it, but they can file a new one.",
      action: "Dismiss",
    },
  } as const;

  return (
    <Panel id="action" title="Action">
      <form id={formId} onSubmit={onSubmit} className="con-stack">
        <div className="con-fields3">
          <Field label="Subject action" htmlFor={`${formId}-subject`}>
            <span className="input select">
              <select
                id={`${formId}-subject`}
                name="subjectAction"
                defaultValue="no_action"
              >
                <option value="no_action">No action</option>
                <option value="warn">Warn</option>
                <option value="suspend">Suspend</option>
                <option value="ban">Ban</option>
              </select>
            </span>
          </Field>

          <Field label="Filer action" htmlFor={`${formId}-filer`}>
            <span className="input select">
              <select
                id={`${formId}-filer`}
                name="filerAction"
                defaultValue="no_action"
              >
                <option value="no_action">No action</option>
                <option value="warn">Warn</option>
                <option value="suspend">Suspend</option>
              </select>
            </span>
          </Field>

          <Field
            label="Content action"
            htmlFor={`${formId}-content`}
            description={
              quarantinable
                ? undefined
                : "This content type can\u2019t be quarantined. Act on the user instead."
            }
          >
            <span className="input select">
              <select
                id={`${formId}-content`}
                name="contentAction"
                defaultValue="no_action"
              >
                <option value="no_action">No action</option>
                {quarantinable && (
                  <option value="quarantine">Quarantine</option>
                )}
              </select>
            </span>
          </Field>
        </div>

        <Checkbox
          name="applyGlobally"
          label={
            <span>
              Apply globally{" "}
              <span className="small muted">
                (propagates suspend/ban to the user&rsquo;s org-wide standing)
              </span>
            </span>
          }
        />

        <Field
          label="Moderator note (internal only)"
          htmlFor={`${formId}-note`}
        >
          <Textarea
            id={`${formId}-note`}
            name="note"
            rows={3}
            placeholder="Optional internal note. Never returned by my_reports()."
          />
        </Field>

        <div className="acts" style={{ display: "flex", gap: 12 }}>
          <Button type="submit" disabled={busy} loading={isPending}>
            Resolve
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={(event) => {
              pendingNote.current = noteOf(event.currentTarget.form!);
              setConfirm("dismiss");
            }}
          >
            Dismiss report
          </Button>
        </div>
      </form>

      <AlertDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogTitle>
            {confirm ? copy[confirm].title : ""}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {confirm ? copy[confirm].body : ""}
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="danger-solid"
              type="button"
              onClick={runConfirmed}
            >
              {confirm ? copy[confirm].action : ""}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Panel>
  );
}
