import type { ProjectStatus } from "~/server/projects/load";
import Badge from "~/ui/badge";

const STATUS: Record<
  ProjectStatus,
  { label: string; variant: "default" | "success" | "warning" }
> = {
  active: { label: "Active", variant: "success" },
  archived: { label: "Archived", variant: "default" },
  proposed: { label: "Legacy: proposed", variant: "warning" },
  declined: { label: "Legacy: declined", variant: "default" },
};

/** A project's lifecycle state. The two legacy states exist only on pre-redesign rows. */
export function StatusBadge({ status }: { status: ProjectStatus }) {
  const { label, variant } = STATUS[status];
  return <Badge variant={variant}>{label}</Badge>;
}
