"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { dismissReport, resolveReport } from "~/server/actions/moderation";
import FormButton from "~/components/FormButton";

export default function ReportActionForm({
  reportId,
  returnTo = "/console/moderation?mode=production",
}: {
  reportId: string;
  returnTo?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

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
    const applyGlobally = formData.get("applyGlobally") === "on";

    startTransition(async () => {
      await resolveReport(
        reportId,
        subjectAction,
        filerAction,
        contentAction,
        note,
        applyGlobally,
      );
      router.push(returnTo);
      router.refresh();
    });
  }

  function handleDismiss(formData: FormData) {
    const note = (formData.get("note") as string) || undefined;
    startTransition(async () => {
      await dismissReport(reportId, note);
      router.push(returnTo);
      router.refresh();
    });
  }

  const selectClass =
    "rounded-sm border border-mauve-600 bg-mauve-800 px-2 py-1.5 text-sm text-white outline-none focus:border-white";

  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-4">
      <h2 className="mb-4 font-semibold text-white">Action</h2>

      <form
        id="resolve-form"
        action={handleResolve}
        className="flex flex-col gap-4"
      >
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
              <option value="quarantine">Quarantine</option>
            </select>
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
            (propagates suspend/ban to the user&rsquo;s org-wide role)
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
            placeholder="Optional internal note — never shown to clients or users"
          />
        </label>

        <div className="flex gap-2">
          <FormButton
            theme="black"
            type="submit"
            form="resolve-form"
            disabled={isPending}
            className="text-sm"
          >
            Resolve
          </FormButton>
          <button
            type="button"
            disabled={isPending}
            className="rounded-sm border border-mauve-600 bg-mauve-800 px-4 py-1.5 text-sm text-white transition-colors hover:border-white disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => {
              const note =
                document.querySelector<HTMLTextAreaElement>(
                  "textarea[name=note]",
                )?.value ?? undefined;
              const fd = new FormData();
              if (note) fd.set("note", note);
              handleDismiss(fd);
            }}
          >
            Dismiss
          </button>
        </div>
      </form>
    </section>
  );
}
