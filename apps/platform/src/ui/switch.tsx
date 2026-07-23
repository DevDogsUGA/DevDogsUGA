"use client";

import { useFormStatus } from "react-dom";
import { SpinnerGapIcon } from "@phosphor-icons/react/ssr";

interface Props {
  /**
   * The current state of the toggle. When the form is submitted, the hidden
   * checkbox will carry the opposite value (i.e. the state-to-be).
   */
  checked: boolean;
  /**
   * The `name` of the hidden checkbox input submitted with the form. When
   * omitted, no checkbox is rendered (useful when the form manages its own
   * intent input, as in OAuthCredentialsField).
   */
  name?: string;
  /**
   * Overrides the `useFormStatus` pending state. Pass this when pending state
   * is managed externally (e.g. via `useActionState` across multiple forms).
   */
  pending?: boolean;
  disabled?: boolean;
}

export default function Toggle({
  checked,
  name,
  pending: pendingProp,
  disabled,
}: Props) {
  const { pending: formPending } = useFormStatus();
  const pending = pendingProp ?? formPending;

  return (
    <button
      className="group relative h-lh w-[3.25em] shrink-0 rounded-full border border-mauve-600 bg-mauve-700 ring-mauve-200 ring-offset-1 outline outline-mauve-700 transition-colors hover:ring disabled:cursor-not-allowed disabled:opacity-50 data-enabled:border-mauve-400 data-enabled:bg-mauve-400"
      type="submit"
      name={checked ? undefined : name}
      value={checked ? undefined : "on"}
      disabled={disabled}
      data-on={checked || pending || undefined}
      data-pending={pending || undefined}
      data-enabled={checked || undefined}
    >
      <span className="absolute top-0 left-0 flex aspect-square h-full items-center justify-center rounded-full bg-mauve-500 shadow-sm transition-[left,translate,background-color] ease-out group-data-enabled:bg-white group-data-on:left-full group-data-on:-translate-x-full">
        <SpinnerGapIcon className="size-3.5 animate-spin text-mauve-700 opacity-0 transition-opacity group-data-pending:opacity-100" />
      </span>
    </button>
  );
}
