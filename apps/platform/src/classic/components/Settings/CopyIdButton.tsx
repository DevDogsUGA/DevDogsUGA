"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckIcon,
  CopyIcon,
  SpinnerGapIcon,
  XIcon,
} from "@phosphor-icons/react/ssr";

type CopyState = "pristine" | "pending" | "success" | "failure";

/** A small copy-to-clipboard button that shows the result for two seconds. */
export default function CopyIdButton({
  value,
  label = "Copy",
}: {
  value: string;
  label?: string;
}) {
  const [state, setState] = useState<CopyState>("pristine");

  const copy = useCallback(() => {
    setState("pending");
    navigator.clipboard
      .writeText(value)
      .then(() => setState("success"))
      .catch((e) => {
        console.error(e);
        setState("failure");
      });
  }, [value]);

  useEffect(() => {
    if (state !== "success" && state !== "failure") return;
    const timeout = setTimeout(() => setState("pristine"), 2000);
    return () => clearTimeout(timeout);
  }, [state]);

  return (
    <button
      type="button"
      onClick={copy}
      disabled={state !== "pristine"}
      data-state={state}
      title={label}
      aria-label={label}
      className="inline-flex rounded-sm border border-mauve-600 p-1 text-mauve-400 transition-colors outline-none hover:bg-mauve-700 focus-visible:ring-2 focus-visible:ring-white disabled:pointer-events-none disabled:border-transparent"
    >
      {state === "pristine" && <CopyIcon aria-hidden />}
      {state === "pending" && (
        <SpinnerGapIcon aria-hidden className="animate-spin" />
      )}
      {state === "success" && (
        <CheckIcon aria-hidden className="text-emerald-600" />
      )}
      {state === "failure" && <XIcon aria-hidden className="text-rose-600" />}
    </button>
  );
}
