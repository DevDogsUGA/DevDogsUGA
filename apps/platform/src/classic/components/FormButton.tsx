"use client";

import type { ButtonHTMLAttributes, DetailedHTMLProps } from "react";
import { useFormStatus } from "react-dom";
import { SpinnerGapIcon } from "@phosphor-icons/react/ssr";

const themeClasses = {
  cyan: "bg-cyan-400 text-black border-2 border-cyan-400 rounded-sm px-4 py-1.5 font-medium enabled:hover:bg-cyan-950 enabled:hover:text-cyan-400 enabled:hover:shadow-sm enabled:hover:shadow-cyan-400/20 focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 transition",
  black:
    "bg-white text-black border-2 border-white rounded-sm px-4 py-1.5 font-medium enabled:hover:bg-transparent enabled:hover:text-white enabled:hover:shadow-sm enabled:hover:shadow-white/10 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 transition",
  rose: "bg-rose-700 text-white border-2 border-rose-700 rounded-sm px-4 py-1.5 font-medium enabled:hover:bg-rose-50 enabled:hover:text-rose-700 enabled:hover:shadow-sm enabled:hover:shadow-rose-700/15 focus-visible:ring-2 focus-visible:ring-rose-700 focus-visible:ring-offset-2 transition",
} as const;

interface Props extends DetailedHTMLProps<
  ButtonHTMLAttributes<HTMLButtonElement>,
  HTMLButtonElement
> {
  theme: keyof typeof themeClasses;
}

export default function FormButton({
  theme,
  children,
  disabled,
  className,
  ...props
}: Props) {
  const { pending } = useFormStatus();

  return (
    <button
      {...props}
      className={
        "relative flex items-center justify-center gap-[1ch] outline-none disabled:cursor-not-allowed disabled:opacity-50 " +
        themeClasses[theme] +
        " " +
        className
      }
      disabled={pending || disabled}
      data-pending={pending || undefined}
    >
      {pending && (
        <span className="absolute inset-0 flex items-center justify-center">
          <SpinnerGapIcon className="animate-spin [animation-duration:750ms]" />
        </span>
      )}
      <span className={pending ? "invisible" : "contents"}>{children}</span>
    </button>
  );
}
