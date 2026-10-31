import type { ProjectStatus } from "~/server/projects/load";
import Badge from "~/ui/badge";

const STATUS: Record<
  ProjectStatus,
  { label: string; variant: "default" | "success" }
> = {
  active: { label: "Active", variant: "success" },
  archived: { label: "Archived", variant: "default" },
};

/** A project's lifecycle state. */
export function StatusBadge({ status }: { status: ProjectStatus }) {
  const { label, variant } = STATUS[status];
  return <Badge variant={variant}>{label}</Badge>;
}
