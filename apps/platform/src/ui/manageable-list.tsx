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
    <div className="flex flex-col gap-3">
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
