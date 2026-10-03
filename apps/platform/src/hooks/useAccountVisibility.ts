"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { createClient } from "~/supabase/client";
import { toast } from "~/lib/toast";
import { revalidateMyPublicProfile } from "~/server/actions/publicProfile";

type Provider = "github" | "discord" | "uga" | "linkedin";

interface AccountVisibility {
  showGithub: boolean;
  showDiscord: boolean;
  showEmail: boolean;
  showLinkedin: boolean;
}

export function useAccountVisibility(
  userId: string,
  initial: AccountVisibility,
) {
  const [showGithub, setShowGithub] = useState(initial.showGithub);
  const [showDiscord, setShowDiscord] = useState(initial.showDiscord);
  const [showEmail, setShowEmail] = useState(initial.showEmail);
  const [showLinkedin, setShowLinkedin] = useState(initial.showLinkedin);

  const mutation = useMutation({
    mutationFn: async ({
      provider,
      show,
    }: {
      provider: Provider;
      show: boolean;
    }) => {
      const supabase = createClient();
      const column =
        provider === "github"
          ? { showGithub: show }
          : provider === "discord"
            ? { showDiscord: show }
            : provider === "linkedin"
              ? { showLinkedin: show }
              : { showEmail: show };
      const { error } = await supabase
        .from("profile")
        .update(column)
        .eq("userId", userId);
      if (error) throw error;
      // GitHub, Discord and LinkedIn appear on the public profile, so the
      // directory and the member's page must drop the cached copy. The email
      // switch is never public. A failure here must not roll the toggle back:
      // the write succeeded, and the cached pages lapse on their own.
      if (provider !== "uga") {
        await revalidateMyPublicProfile().catch(() => undefined);
      }
      return { provider, show };
    },
    onSuccess: ({ provider, show }) => {
      const label = {
        github: "GitHub",
        discord: "Discord",
        linkedin: "LinkedIn",
        uga: "Email",
      }[provider];
      toast.success(`${label} ${show ? "shown" : "hidden"} on profile`);
    },
    onMutate: ({ provider, show }) => {
      const previous =
        provider === "github"
          ? showGithub
          : provider === "discord"
            ? showDiscord
            : provider === "linkedin"
              ? showLinkedin
              : showEmail;
      if (provider === "github") setShowGithub(show);
      else if (provider === "discord") setShowDiscord(show);
      else if (provider === "linkedin") setShowLinkedin(show);
      else setShowEmail(show);
      return { provider, previous };
    },
    onError: (_err, _vars, context) => {
      if (!context) return;
      if (context.provider === "github") setShowGithub(context.previous);
      else if (context.provider === "discord") setShowDiscord(context.previous);
      else if (context.provider === "linkedin")
        setShowLinkedin(context.previous);
      else setShowEmail(context.previous);
      toast.error("Failed to update visibility");
    },
  });

  return {
    showGithub,
    showDiscord,
    showEmail,
    showLinkedin,
    toggle: (provider: Provider) =>
      mutation.mutate({
        provider,
        show:
          provider === "github"
            ? !showGithub
            : provider === "discord"
              ? !showDiscord
              : provider === "linkedin"
                ? !showLinkedin
                : !showEmail,
      }),
    isPending: (provider: Provider) =>
      mutation.isPending && mutation.variables?.provider === provider,
  };
}
