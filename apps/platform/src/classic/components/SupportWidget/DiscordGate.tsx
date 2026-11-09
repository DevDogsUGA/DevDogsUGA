"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import type { SupportViewer } from "~/lib/support/types";
import { cn } from "~/lib/cn";

export type GateStep = "sign-in" | "link-discord" | "view-in-discord";

/**
 * The one next step toward seeing something only Discord can show. A guest
 * signs in; a member without Discord links it (which also joins them to the
 * server); a linked member opens Discord. Every part of a message the widget
 * cannot render without an extra Discord request falls back through this.
 */
export function gateStep(viewer: SupportViewer): GateStep {
  if (viewer.kind !== "member") return "sign-in";
  return viewer.discordLinked ? "view-in-discord" : "link-discord";
}

export function useGateHref(viewer: SupportViewer, discordUrl: string) {
  const pathname = usePathname() ?? "/docs";
  const next = encodeURIComponent(pathname);
  const step = gateStep(viewer);
  return {
    step,
    href:
      step === "sign-in"
        ? `/support/sign-in?next=${next}`
        : step === "link-discord"
          ? `/support/link-discord?next=${next}`
          : discordUrl,
  };
}

const LABEL: Record<GateStep, string> = {
  "sign-in": "Sign in to see",
  "link-discord": "Link Discord to see",
  "view-in-discord": "View in Discord",
};

/** An inline pill standing in for a mention or item the widget can't resolve. */
export function GatePill({
  viewer,
  discordUrl,
  children,
  className,
}: {
  viewer: SupportViewer;
  discordUrl: string;
  children: ReactNode;
  className?: string;
}) {
  const { step, href } = useGateHref(viewer, discordUrl);
  const external = step === "view-in-discord";
  return (
    <a
      href={href}
      title={LABEL[step]}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className={cn(
        "bg-muted text-muted-foreground hover:text-foreground inline-flex items-baseline gap-1 rounded px-1 font-medium no-underline",
        className,
      )}
    >
      {children}
      <span className="text-[0.7em] opacity-75">({LABEL[step]})</span>
    </a>
  );
}
