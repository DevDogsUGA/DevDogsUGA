"use client";

import "./fields.css";
import * as React from "react";
import { CheckIcon, MinusIcon } from "@phosphor-icons/react/ssr";

import { cn } from "~/lib/cn";

type CheckboxProps = Omit<
  React.ComponentProps<"input">,
  "type" | "children"
> & {
  /** `radio` draws the pixel-round `.check.radio`. */
  type?: "checkbox" | "radio";
  /** Visible text. Omit it and pass `aria-label` for a bare box. */
  label?: React.ReactNode;
  /**
   * The mixed state of a "select all" over a partly picked list: draws the
   * filled box with a dash and sets the native `indeterminate` flag, which is
   * what assistive tech reads as mixed. Checkbox only. The
   * caller owns what a click does next (the native `checked` is unchanged).
   */
  indeterminate?: boolean;
  /** Classes for the wrapping `<label>`; `className` is for the input. */
  wrapperClassName?: string;
};

/**
 * The kit's `.check`: a real `<input type=checkbox|radio>`, visually hidden but
 * focusable, with the stepped square (or pixel-round dot) drawn as a sibling.
 * Checked and focus states come from the input via CSS (`fields.css`), so it
 * works controlled or uncontrolled with no state of its own. `aria-invalid`
 * outlines the unchecked box in the invalid colour. `indeterminate` is the
 * mixed state (a dash, and the native `indeterminate` flag).
 */
function Checkbox({
  type = "checkbox",
  label,
  className,
  wrapperClassName,
  indeterminate = false,
  "aria-invalid": ariaInvalid,
  ref,
  ...props
}: CheckboxProps) {
  const mixed = indeterminate && type === "checkbox";
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  // A click clears the native flag itself; syncing on every render restores it
  // while the caller still says mixed.
  React.useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = mixed;
  });
  const setRef = (el: HTMLInputElement | null) => {
    inputRef.current = el;
    if (typeof ref === "function") ref(el);
    else if (ref) ref.current = el;
  };
  return (
    <label
      className={cn("check", type === "radio" && "radio", wrapperClassName)}
      data-invalid={ariaInvalid === true || ariaInvalid === "true" || undefined}
    >
      <input
        type={type}
        data-slot={type}
        aria-invalid={ariaInvalid}
        className={className}
        ref={setRef}
        {...props}
      />
      <i aria-hidden>
        {type === "checkbox" &&
          (mixed ? <MinusIcon weight="bold" /> : <CheckIcon weight="bold" />)}
      </i>
      {label}
    </label>
  );
}

function Radio(props: Omit<CheckboxProps, "type">) {
  return <Checkbox {...props} type="radio" />;
}

export { Checkbox, Radio };
export type { CheckboxProps };
