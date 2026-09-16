import { type ButtonHTMLAttributes } from "react";

const VARIANT_CLASSES = {
  primary:
    "bg-primary font-semibold text-white not-disabled:hover:bg-primary-strong",
  secondary:
    "border border-edge-strong bg-surface font-medium text-foreground not-disabled:hover:bg-surface-muted",
  ghost: "font-medium text-muted not-disabled:hover:bg-surface-muted not-disabled:hover:text-foreground",
} as const;

const SIZE_CLASSES = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2",
  lg: "px-6 py-2.5 text-lg",
} as const;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANT_CLASSES;
  size?: keyof typeof SIZE_CLASSES;
}

export function Button({
  variant = "primary",
  size = "md",
  // The HTML default is "submit", which submits any surrounding form; almost
  // every consumer here wants a plain click handler, so opt out by default.
  type = "button",
  className = "",
  ...rest
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      type={type}
      {...rest}
    />
  );
}
