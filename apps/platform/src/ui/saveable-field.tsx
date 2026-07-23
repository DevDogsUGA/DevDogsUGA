"use client";

import type { ReactNode } from "react";
import { useSaveShortcut } from "~/hooks/useSaveShortcut";
import { useUnsavedChangesWarning } from "~/hooks/useUnsavedChangesWarning";
import InlineSave from "~/ui/inline-save";

interface SaveableFieldProps {
  isDirty: boolean;
  isPending: boolean;
  onSave: () => void;
  onReset?: () => void;
  disabled?: boolean;
  meta?: ReactNode;
  secondaryMeta?: ReactNode;
  className?: string;
  children: ReactNode;
}

export default function SaveableField({
  isDirty,
  isPending,
  onSave,
  onReset,
  disabled,
  meta,
  secondaryMeta,
  className,
  children,
}: SaveableFieldProps) {
  useUnsavedChangesWarning(isDirty);
  const canSave = isDirty && !disabled && !isPending;
  const shortcut = useSaveShortcut(onSave, canSave);

  return (
    <div className={className} onFocus={shortcut.onFocus} onBlur={shortcut.onBlur}>
      {children}
      <InlineSave
        show={canSave}
        isPending={isPending}
        onSave={onSave}
        onReset={onReset}
        meta={meta}
        secondaryMeta={secondaryMeta}
        focused={shortcut.focused}
      />
    </div>
  );
}
