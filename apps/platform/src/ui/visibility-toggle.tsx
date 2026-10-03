"use client";

import Toggle from "~/ui/switch";

interface Props {
  checked: boolean;
  pending: boolean;
  onToggle: () => void;
  /** What the switch controls. Defaults to the connected-account wording. */
  label?: string;
}

export default function VisibilityToggle({
  checked,
  pending,
  onToggle,
  label = "Display on Profile",
}: Props) {
  return (
    <form
      className="flex items-center gap-3 self-start text-sm text-white"
      onSubmit={(e) => {
        e.preventDefault();
        onToggle();
      }}
    >
      <label className="contents">
        <Toggle checked={checked} pending={pending} disabled={pending} />
        {label}
      </label>
      <span className="text-mauve-400">
        {checked ? "(Currently Visible)" : "(Currently Hidden)"}
      </span>
    </form>
  );
}
