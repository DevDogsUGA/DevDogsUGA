import type { ComponentProps, ReactNode } from "react";
import { cn } from "~/lib/cn";
import { ConsoleCard } from "~/classic/ui/card";

/**
 * The few shapes the data tools need that the baseline's console pages had no
 * component for (a table, a radio group, a labelled field with an error). Each
 * is built from the baseline's own classes: `ConsoleCard`, the console's
 * rounded `white/10` control, its mauve rules and its text sizes.
 */

export const CONTROL =
  "rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white outline-none placeholder:text-white/30 focus:border-white/40";

/** A console card: the baseline's `ConsoleCard` with its title and content. */
export function Section({
  id,
  title,
  description,
  children,
}: {
  id?: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <ConsoleCard.Root id={id}>
      <ConsoleCard.Header title={title} description={description} />
      <ConsoleCard.Content>
        <div className="flex flex-col gap-5">{children}</div>
      </ConsoleCard.Content>
    </ConsoleCard.Root>
  );
}

/** A label, optional help, the control, and an error under it. */
export function LabeledField({
  label,
  description,
  htmlFor,
  required,
  error,
  children,
}: {
  label: string;
  description?: string;
  htmlFor?: string;
  required?: boolean;
  error?: string | null;
  children: ReactNode;
}) {
  const header = (
    <span className="flex max-w-sm flex-col gap-1">
      <span className="text-xs font-medium text-white/70">
        {label}
        {required && <span className="ml-2 text-mauve-400">Required</span>}
      </span>
      {description && (
        <span className="text-xs text-balance text-mauve-400">
          {description}
        </span>
      )}
    </span>
  );
  const body = (
    <>
      {children}
      {error && (
        <span role="alert" className="text-xs text-rose-400">
          {error}
        </span>
      )}
    </>
  );
  return htmlFor ? (
    <label htmlFor={htmlFor} className="flex flex-col gap-1.5">
      {header}
      {body}
    </label>
  ) : (
    <div className="flex flex-col gap-1.5">
      {header}
      {body}
    </div>
  );
}

/** One choice among a few: a native radio group. */
export function Radios({
  ariaLabel,
  name,
  value,
  onValueChange,
  options,
}: {
  ariaLabel: string;
  name: string;
  value: string;
  onValueChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="flex flex-wrap gap-x-5 gap-y-2"
    >
      {options.map((option) => (
        <label
          key={option.value}
          className="flex cursor-pointer items-center gap-2 text-sm text-white/80"
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onValueChange(option.value)}
            className="accent-indigo-400"
          />
          {option.label}
        </label>
      ))}
    </div>
  );
}

export function Check({
  label,
  className,
  ...props
}: Omit<ComponentProps<"input">, "type"> & { label: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-white/80">
      <input
        type="checkbox"
        className={cn("accent-indigo-400", className)}
        {...props}
      />
      {label}
    </label>
  );
}

export function Table({
  caption,
  children,
}: {
  caption: string;
  children: ReactNode;
}) {
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}

export const THead = ({ children }: { children: ReactNode }) => (
  <thead>{children}</thead>
);
export const TBody = ({ children }: { children: ReactNode }) => (
  <tbody className="divide-y divide-mauve-800">{children}</tbody>
);
export const Tr = ({ children }: { children: ReactNode }) => (
  <tr>{children}</tr>
);
export function Th({ children, num }: { children: ReactNode; num?: boolean }) {
  return (
    <th
      scope="col"
      className={cn(
        "border-b border-mauve-800 px-3 py-2 text-xs font-medium text-mauve-400",
        num ? "text-right" : "text-left",
      )}
    >
      {children}
    </th>
  );
}
export function Td({
  children,
  num,
  className,
}: {
  children: ReactNode;
  num?: boolean;
  className?: string;
}) {
  return (
    <td
      className={cn(
        "px-3 py-2 align-top text-mauve-200",
        num && "text-right tabular-nums",
        className,
      )}
    >
      {children}
    </td>
  );
}

/** A secondary button, as the console's other bordered controls. */
export const SECONDARY =
  "inline-flex items-center gap-2 rounded-sm border border-mauve-600 bg-mauve-800 px-4 py-1.5 text-sm text-white transition-colors hover:border-white disabled:cursor-not-allowed disabled:opacity-50";
