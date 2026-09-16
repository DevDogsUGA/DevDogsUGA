"use client";

import { Button } from "./Button";
import { Dialog } from "./Dialog";

interface DeletePlanProps {
  onConfirm: () => void;
  onCancel: () => void;
  planTitle: string;
}

export default function DeletePlan({
  onConfirm,
  onCancel,
  planTitle,
}: DeletePlanProps) {
  return (
    <Dialog
      title="Delete Plan"
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onConfirm}>Delete</Button>
        </>
      }
    >
      <p className="px-6 py-4">
        Are you sure you want to delete <strong>{planTitle}</strong>? This
        can&apos;t be undone.
      </p>
    </Dialog>
  );
}
