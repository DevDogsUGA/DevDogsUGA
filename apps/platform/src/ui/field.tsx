"use client";

import { createContext, useContext, useId } from "react";
import type { PropsWithChildren } from "react";
import { WarningCircleIcon } from "@phosphor-icons/react/ssr";

interface FieldControlContext {
  /** Space-separated ids of the help and error text, for `aria-describedby`. */
  describedBy?: string;
  /** True while the field shows an error. */
  invalid: boolean;
}

const FieldControl = createContext<FieldControlContext>({ invalid: false });

/**
 * What a control inside a `Field` adds to its own aria props: the help and
 * error text ids merged after any `aria-describedby` the caller passed, and
 * `aria-invalid` while the field has an error (a caller's value wins). Outside
 * a `Field` it returns the props unchanged.
 */
function useFieldControlProps({
  "aria-describedby": own,
  "aria-invalid": invalid,
}: {
  "aria-describedby"?: string;
  "aria-invalid"?: React.AriaAttributes["aria-invalid"];
}) {
  const field = useContext(FieldControl);
  const describedBy = [own, field.describedBy].filter(Boolean).join(" ");
  return {
    "aria-describedby": describedBy || undefined,
    "aria-invalid": invalid ?? (field.invalid ? true : undefined),
  };
}

interface FieldProps extends PropsWithChildren {
  label: string;
  description?: string;
  htmlFor?: string;
  id?: string;
  /** Shown under the control with an icon and `role="alert"`; never colour alone. */
  error?: string | null;
  /** Adds a visible "Required" next to the label. */
  required?: boolean;
  /** Right-aligned under the control: "112 / 240". */
  count?: string;
}

/**
 * The kit's `.field`: label, control, help text, error. With `htmlFor` the whole
 * block is the `<label>` (clicking the text focuses the control); without it the
 * block is a `<div>` and the control brings its own label. `Input`, `Textarea`
 * and `SelectTrigger` inside it point `aria-describedby` at the help and error
 * text (after any ids the caller passed) and take `aria-invalid` from `error`.
 */
export default function Field({
  label,
  description,
  htmlFor,
  id,
  error,
  required,
  count,
  children,
}: FieldProps) {
  const base = useId();
  const helpId = `${base}-help`;
  const errId = `${base}-err`;
  const describedBy =
    [description && helpId, error && errId].filter(Boolean).join(" ") ||
    undefined;
  const header = (
    <>
      <span className="label">
        {label}
        {required && (
          <span className="ml-2 text-[12.5px] font-normal text-[var(--text-3)]">
            Required
          </span>
        )}
      </span>
    </>
  );
  const footer = (
    <>
      {description && (
        <span id={helpId} className="help max-w-prose">
          {description}
        </span>
      )}
      {error && (
        <span id={errId} className="err" role="alert">
          <WarningCircleIcon weight="fill" aria-hidden className="shrink-0" />
          {error}
        </span>
      )}
      {count && <span className="count">{count}</span>}
    </>
  );

  // scroll-mt clears the sticky TopNav when search jumps to #id.
  const className = "field scroll-mt-20";

  const control = { describedBy, invalid: Boolean(error) };
  return (
    <FieldControl.Provider value={control}>
      {htmlFor ? (
        <label id={id} className={className} htmlFor={htmlFor}>
          {header}
          {children}
          {footer}
        </label>
      ) : (
        <div id={id} className={className}>
          {header}
          {children}
          {footer}
        </div>
      )}
    </FieldControl.Provider>
  );
}

export { useFieldControlProps };
