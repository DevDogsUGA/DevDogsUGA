"use client";

import * as React from "react";

import { cn } from "~/lib/cn";
import { useFieldControlProps } from "~/ui/field";

/**
 * The kit's `.input.area` frame around a native `<textarea>`. Props forward to
 * the textarea (`ref`, `name`, `value`, `rows`, `maxLength`, `aria-*`); the
 * `className` and `style` go to the frame. The field grows with its content and
 * never shrinks below the frame's 112px.
 */
function Textarea({
  className,
  style,
  ...rest
}: React.ComponentProps<"textarea">) {
  const props = { ...rest, ...useFieldControlProps(rest) };
  return (
    <span
      data-slot="textarea-frame"
      className={cn(
        "input area flex flex-col items-stretch has-disabled:cursor-not-allowed has-disabled:opacity-60 has-[[aria-invalid=true]]:[--bo:var(--bad)]",
        className,
      )}
      style={style}
    >
      <textarea
        data-slot="textarea"
        className="block [field-sizing:content] min-h-0 w-full flex-auto resize-none overflow-y-auto"
        {...props}
      />
    </span>
  );
}

export { Textarea };
