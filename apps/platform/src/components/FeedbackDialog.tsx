"use client";

import {
  FeedbackDialog as FeedbackDialogBase,
  type DialogTheme,
} from "~/components/moderation";
import { submitFeedback } from "~/server/actions/feedback";
import { createClient } from "~/supabase/client";
import { PLATFORM_APP_SLUG } from "~/config/apps";

interface FeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Matches the dark "console dialog" look shared by TestAccountDialog,
// CreateCredentialDialog, etc. (bg-mauve-900, border-mauve-700, cyan-400
// accents, rounded-xl).
const devDogsTheme: Partial<DialogTheme> = {
  background: "var(--color-mauve-900)",
  foreground: "var(--color-white)",
  muted: "var(--color-mauve-400)",
  border: "var(--color-mauve-700)",
  accent: "var(--color-cyan-400)",
  accentForeground: "var(--color-black)",
  radius: "0.75rem",
  fontFamily: "inherit",
};

/**
 * Feedback about the DevDogs site itself.
 *
 * Reads and writes by different routes, deliberately. Topics load over
 * PostgREST through `list_feedback_topics`, exactly as any other app's would —
 * the site is a registered app in `platform."apps"`, not a special case, and
 * dogfooding the RPC is how it stays honest. Submission goes through a server
 * action instead, because the console *has* a backend and reaches the table
 * directly as the `postgres` role; routing that back out through HTTP would buy
 * nothing.
 *
 * The dialog is the same component either way.
 */
export default function FeedbackDialog({
  open,
  onOpenChange,
}: FeedbackDialogProps) {
  return (
    <FeedbackDialogBase
      open={open}
      onOpenChange={onOpenChange}
      client={createClient()}
      app={PLATFORM_APP_SLUG}
      theme={devDogsTheme}
      onSubmit={async (values) => {
        const fd = new FormData();
        fd.set("type", values.type);
        if (values.topicId) fd.set("topicId", values.topicId);
        if (values.severity) fd.set("severity", values.severity);
        fd.set("title", values.title);
        fd.set("description", values.description);
        if (values.browserMetadata) {
          fd.set("browserMetadata", JSON.stringify(values.browserMetadata));
        }
        await submitFeedback(fd);
      }}
    />
  );
}
