"use client";

import * as React from "react";

import { cn } from "~/lib/cn";
import { useFieldControlProps } from "~/ui/field";

/**
 * Input types that are not a text box: they keep the browser's own control (or
 * none at all) and are returned unframed, with `className` on the element
 * itself, exactly as the bare `<input>` this component used to be.
 */
const UNFRAMED_TYPES = new Set([
  "hidden",
  "checkbox",
  "radio",
  "file",
  "range",
  "color",
  "image",
  "submit",
  "reset",
  "button",
]);

/**
 * The kit's `.input` field frame around a native `<input>`.
 *
 * Every native prop (`ref`, `name`, `value`, `defaultValue`, `onChange`,
 * `aria-*`, `autoComplete`, `inputMode`, `maxLength`, `form`, `required`,
 * `data-*`, spread from `react-hook-form`'s `register`) lands on the inner
 * `<input>`. `className` and `style` go to the frame, which is what a caller
 * sizes (`max-w-sm`, `w-40`). `aria-invalid` on the input draws the frame in
 * the invalid colour; `disabled` dims it. Not for checkboxes, radios or files:
 * those are returned bare (see `UNFRAMED_TYPES`), and `Checkbox` is the kit's.
 */
function Input({
  className,
  style,
  type,
  ...rest
}: React.ComponentProps<"input">) {
  const aria = useFieldControlProps(rest);
  const props = { ...rest, ...aria };
  if (type && UNFRAMED_TYPES.has(type)) {
    return (
      <input
        type={type}
        data-slot="input"
        className={className}
        style={style}
        {...props}
      />
    );
  }
  return (
    <span
      data-slot="input-frame"
      className={cn(
        "input has-disabled:cursor-not-allowed has-disabled:opacity-60 has-[[aria-invalid=true]]:[--bo:var(--bad)]",
        className,
      )}
      style={style}
    >
      <input type={type} data-slot="input" {...props} />
    </span>
  );
}

export { Input };
