"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { dismissReport, resolveReport } from "~/server/actions/moderation";
import FormButton from "~/components/FormButton";

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
   * Whether this report's content type supports quarantine — i.e. whether its
   * table carries the foreign key to `platform."reportResolutions"`.
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
   * `platform.resolve_report()` from the browser. Same decision, same rules —
   * both end up in the same SQL function — so this is a transport seam and not
   * a second implementation. The previous attempt at this was a whole duplicate
   * component, and it drifted.
   */
  onResolve?: (args: ResolveArgs) => void;
  onDismiss?: (note?: string) => void;
  disabled?: boolean;
}

export default function ReportActionForm({
  reportId,
  quarantinable,
  returnTo = "/console/moderation",
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

  const selectClass =
    "rounded-sm border border-mauve-600 bg-mauve-800 px-2 py-1.5 text-sm text-white outline-none focus:border-white";
  const formId = `resolve-form-${reportId}`;

  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-4">
      <h2 className="mb-4 font-semibold text-white">Action</h2>

      <form id={formId} action={handleResolve} className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-mauve-400">Subject action</span>
            <select
              name="subjectAction"
              className={selectClass}
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
              className={selectClass}
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
              className={selectClass}
              defaultValue="no_action"
            >
              <option value="no_action">No action</option>
              {quarantinable && <option value="quarantine">Quarantine</option>}
            </select>
            {!quarantinable && (
              <span className="text-xs text-mauve-500">
                This content type can&rsquo;t be quarantined — act on the user
                instead.
              </span>
            )}
          </label>
        </div>

        <label className="flex items-center gap-2 text-sm text-white">
          <input
            type="checkbox"
            name="applyGlobally"
            className="accent-rose-400"
          />
          <span>Apply globally</span>
          <span className="text-xs text-mauve-400">
            (propagates suspend/ban to the user&rsquo;s org-wide standing)
          </span>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-mauve-400">
            Moderator note (internal only)
          </span>
          <textarea
            name="note"
            rows={3}
            className="rounded-sm border border-mauve-600 bg-mauve-800 px-3 py-2 text-sm text-white outline-none placeholder:text-mauve-500 focus:border-white"
            placeholder="Optional internal note — never returned by my_reports()"
          />
        </label>

        <div className="flex gap-2">
          <FormButton
            theme="black"
            type="submit"
            form={formId}
            disabled={busy}
            className="text-sm"
          >
            Resolve
          </FormButton>
          <button
            type="button"
            disabled={busy}
            className="rounded-sm border border-mauve-600 bg-mauve-800 px-4 py-1.5 text-sm text-white transition-colors hover:border-white disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => {
              const note =
                document.querySelector<HTMLTextAreaElement>(
                  `#${CSS.escape(formId)} textarea[name=note]`,
                )?.value ?? undefined;
              handleDismiss(note || undefined);
            }}
          >
            Dismiss
          </button>
        </div>
      </form>
    </section>
  );
}
