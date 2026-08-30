import type { ReactNode } from "react";
import { cn } from "~/lib/cn";

const TONE_CLASSES = {
  info: "border-blue-400/30 bg-blue-400/10 text-blue-200",
  success: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  warning: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  critical: "border-rose-400/30 bg-rose-400/10 text-rose-200",
} as const;

export type CalloutTone = keyof typeof TONE_CLASSES;

interface CalloutProps {
  tone?: CalloutTone;
  /** Bolded first line. Omit for a single-sentence notice. */
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
  /**
   * Announce the callout when it appears. For something the reader caused, like
   * a failed connection or a rejected upload, not for standing context.
   */
  alert?: boolean;
  id?: string;
}

/**
 * Something worth saying next to the thing it is about: a refusal, a warning,
 * a confirmation.
 *
 * One component because these were nine separate inline blocks: an amber `div`
 * on the permissions page, a red `p` on the sandbox page, a green box on the
 * ballot, an `aside` for a locked roster, each picking its own border radius
 * and opacity. The tone is the only thing that ought to vary.
 */
export default function Callout({
  tone = "info",
  title,
  children,
  className,
  alert,
  id,
}: CalloutProps) {
  return (
    <div
      id={id}
      role={alert ? "alert" : undefined}
      className={cn(
        "rounded-xl border px-4 py-3 text-sm",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {title && <p className="font-medium">{title}</p>}
      {children && (
        <div className={cn("[&_a]:underline", title && "mt-1 opacity-90")}>
          {children}
        </div>
      )}
    </div>
  );
}
