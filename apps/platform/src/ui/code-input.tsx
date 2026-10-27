"use client";

import "./fields.css";
import { Fragment, useId } from "react";

import { cn } from "~/lib/cn";
import { useCodeInput, type CodeInputOptions } from "~/hooks/useCodeInput";

interface CodeInputProps extends Omit<CodeInputOptions, "length"> {
  /** Cells. 6 for the meeting code, 8 for the device code (shown `XXXX-XXXX`). Default 6. */
  length?: number;
  /** Names the group ("Meeting code"). */
  "aria-label": string;
  /** Submitted with the form as one string, no dash. */
  name?: string;
  invalid?: boolean;
  disabled?: boolean;
  className?: string;
}

/**
 * The segmented code field (`checkin.html` `.code`): one `.input` cell per
 * character on `useCodeInput`. Numeric keypad and `one-time-code` autofill for
 * digits; uppercased letters and digits for the eight-character device code,
 * with a dash between the halves. Each cell is labelled "Digit 3 of 6" for
 * assistive tech; `invalid` sets `aria-invalid` on every cell.
 */
function CodeInput({
  length = 6,
  kind,
  value,
  defaultValue,
  onChange,
  onComplete,
  name,
  invalid,
  disabled,
  className,
  "aria-label": ariaLabel,
}: CodeInputProps) {
  const resolvedKind = kind ?? (length === 8 ? "alphanumeric" : "digits");
  const code = useCodeInput({
    length,
    kind: resolvedKind,
    value,
    defaultValue,
    onChange,
    onComplete,
  });
  const groupId = useId();

  return (
    <span
      role="group"
      aria-label={ariaLabel}
      id={groupId}
      className={cn(
        "flex w-full max-w-max items-center gap-1.5 sm:gap-2",
        className,
      )}
    >
      {name && <input type="hidden" name={name} value={code.value} />}
      {Array.from({ length }, (_, i) => (
        <Fragment key={i}>
          {length === 8 && i === 4 && (
            <span aria-hidden className="px-0.5 text-[var(--text-3)]">
              -
            </span>
          )}
          <span
            className={cn(
              "input mono max-w-11 min-w-0 flex-1 basis-0 justify-center px-0 text-center has-disabled:opacity-60 has-[[aria-invalid=true]]:[--bo:var(--bad)]",
            )}
          >
            <input
              {...code.cellProps(i)}
              aria-invalid={invalid ? true : undefined}
              disabled={disabled}
              className="h-full text-center text-[18px]"
            />
          </span>
        </Fragment>
      ))}
    </span>
  );
}

export { CodeInput };
export type { CodeInputProps };
