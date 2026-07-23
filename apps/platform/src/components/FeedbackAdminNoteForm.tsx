"use client";

import { useState, useTransition } from "react";
import FormButton from "~/components/FormButton";
import { updateFeedbackAdminNote } from "~/server/actions/feedback";

interface Props {
  feedbackId: string;
  adminNote: string | null;
}

export default function FeedbackAdminNoteForm({
  feedbackId,
  adminNote,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function handleSave(formData: FormData) {
    const note = (formData.get("adminNote") as string) ?? "";
    startTransition(async () => {
      await updateFeedbackAdminNote(feedbackId, note);
      setSaved(true);
    });
  }

  return (
    <form
      action={handleSave}
      onChange={() => setSaved(false)}
      className="flex flex-col gap-2"
    >
      <textarea
        name="adminNote"
        rows={3}
        defaultValue={adminNote ?? ""}
        placeholder="Internal note — never shown to the submitter"
        className="rounded-sm border border-mauve-600 bg-mauve-800 px-3 py-2 text-sm text-white outline-none placeholder:text-mauve-500 focus:border-white"
      />
      <div className="flex items-center gap-3">
        <FormButton
          theme="black"
          type="submit"
          disabled={isPending}
          className="text-sm"
        >
          Save note
        </FormButton>
        {saved && !isPending && (
          <span className="text-xs text-emerald-400">Saved</span>
        )}
      </div>
    </form>
  );
}
