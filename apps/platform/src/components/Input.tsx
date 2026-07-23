"use client";

import {
  useCallback,
  useEffect,
  useState,
  type FocusEvent,
  type InputHTMLAttributes,
  type PropsWithChildren,
} from "react";
import { CheckIcon, CopyIcon, SpinnerGapIcon, LockIcon, XIcon } from "@phosphor-icons/react/ssr";

interface InputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "className"
> {
  className?: string;
  mono?: boolean;
  copy?: boolean;
}

function InputBase({
  mono,
  copy,
  className,
  value,
  disabled,
  readOnly,
  onFocus,
  ...props
}: InputProps) {
  const [copyState, setCopyState] = useState<
    "pristine" | "pending" | "success" | "failure"
  >("pristine");

  const handleCopy = useCallback(() => {
    if (typeof value !== "string") return;
    setCopyState("pending");
    navigator.clipboard
      .writeText(value)
      .then(() => setCopyState("success"))
      .catch((e) => {
        console.error(e);
        setCopyState("failure");
      });
  }, [value]);

  const handleFocus = useCallback((e: FocusEvent<HTMLInputElement>) => {
    e.currentTarget.setSelectionRange(0, -1, "none");
  }, []);

  useEffect(() => {
    if (copyState === "success" || copyState === "failure") {
      const timeout = setTimeout(() => setCopyState("pristine"), 2000);
      return () => clearTimeout(timeout);
    }
  }, [copyState]);

  return (
    <div
      className={`group has-read-only:shadow-block-sm focus-within:shadow-block-sm relative flex items-center overflow-hidden rounded-sm border border-mauve-600 bg-mauve-900 text-sm transition-shadow hover:border-mauve-500 has-disabled:cursor-not-allowed has-disabled:border-mauve-700 ${className ?? ""}`}
    >
      {disabled && (
        <LockIcon className="absolute left-3 text-mauve-500 transition-colors group-hover:text-mauve-300" />
      )}
      <input
        className={`form-input w-full border-0 bg-mauve-800 px-3 text-sm text-white transition-shadow group-hover:not-disabled:not-read-only:inset-shadow-sm placeholder:text-mauve-500 read-only:not-data-copy:pl-9 focus:ring-0 focus:inset-shadow-sm disabled:pointer-events-none disabled:bg-mauve-900/50 disabled:pl-9 disabled:text-mauve-500 data-copy:pr-10.5 data-copy:font-mono data-mono:font-mono`}
        value={value}
        disabled={disabled}
        readOnly={copy ? true : readOnly}
        onFocus={copy ? handleFocus : onFocus}
        data-copy={copy ? true : undefined}
        data-mono={mono ? true : undefined}
        {...props}
      />
      {copy && !disabled && (
        <button
          className="transition-color group absolute right-1.5 flex items-center rounded-sm border border-mauve-600 px-1.5 py-1 text-mauve-400 transition-colors hover:bg-mauve-700 disabled:pointer-events-none disabled:border-transparent"
          type="button"
          onClick={handleCopy}
          disabled={copyState !== "pristine" || disabled}
          data-state={copyState}
          title="Copy"
        >
          <CopyIcon className="hidden group-data-[state=pristine]:block" />
          <SpinnerGapIcon className="hidden animate-spin group-data-[state=pending]:block" />
          <CheckIcon className="hidden text-emerald-600 group-data-[state=success]:block" />
          <XIcon className="hidden text-rose-600 group-data-[state=failure]:block" />
        </button>
      )}
    </div>
  );
}

function MonoText({ children }: PropsWithChildren) {
  return (
    <span className="cursor-default rounded-sm bg-white/10 px-1.25 py-0.5 font-mono text-rose-300">
      {children}
    </span>
  );
}

export default Object.assign(InputBase, { Text: MonoText });
