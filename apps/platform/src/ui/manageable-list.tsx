"use client";

import type { ReactNode } from "react";

interface ManageableListProps<T extends { id: string }> {
  items: T[];
  onRemove: (id: string) => void;
  isPending: boolean;
  error: string | null;
  renderItem: (item: T, onRemove: () => void) => ReactNode;
  addForm: ReactNode;
  actions?: ReactNode;
  emptyLabel?: string;
}

export default function ManageableList<T extends { id: string }>({
  items,
  onRemove,
  isPending,
  error,
  renderItem,
  addForm,
  actions,
  emptyLabel = "None yet.",
}: ManageableListProps<T>) {
  return (
    // `aria-busy` is what `isPending` drives. The prop is part of this
    // component's published surface (it appears in ds-bundle's .d.ts and every
    // preview passes it) but nothing here read it, so a consumer could pass it
    // and get no behaviour at all. Semantics only, deliberately: `renderItem`
    // is caller-supplied, so any visual treatment of a pending row belongs to
    // whoever renders it.
    <div className="flex flex-col gap-3" aria-busy={isPending}>
      {items.length === 0 ? (
        <p className="text-sm text-mauve-400">{emptyLabel}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {items.map((item) => renderItem(item, () => onRemove(item.id)))}
        </div>
      )}

      {addForm}

      {error && <p className="text-xs text-rose-400">{error}</p>}

      {actions}
    </div>
  );
}
