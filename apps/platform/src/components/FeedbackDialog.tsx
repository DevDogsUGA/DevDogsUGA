"use client";

import {
  FeedbackDialog as FeedbackDialogBase,
  type FeedbackDialogTheme,
} from "@devdogsuga/feedback-client/react";
import { submitFeedback } from "~/server/actions/feedback";
import { DEVDOGS_WEBSITE_FEEDBACK_TOPICS } from "~/server/actions/feedbackTopicsData";

interface FeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Matches the dark "console dialog" look shared by TestAccountDialog,
// CreateCredentialDialog, etc. (bg-mauve-900, border-mauve-700, cyan-400
// accents, rounded-xl).
const devDogsTheme: Partial<FeedbackDialogTheme> = {
  background: "var(--color-mauve-900)",
  foreground: "var(--color-white)",
  muted: "var(--color-mauve-400)",
  border: "var(--color-mauve-700)",
  accent: "var(--color-cyan-400)",
  accentForeground: "var(--color-black)",
  radius: "0.75rem",
  fontFamily: "inherit",
};

export default function FeedbackDialog({
  open,
  onOpenChange,
}: FeedbackDialogProps) {
  return (
    <FeedbackDialogBase
      open={open}
      onOpenChange={onOpenChange}
      topics={[...DEVDOGS_WEBSITE_FEEDBACK_TOPICS]}
      theme={devDogsTheme}
      onSubmit={async (values) => {
        const fd = new FormData();
        fd.set("type", values.type);
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
