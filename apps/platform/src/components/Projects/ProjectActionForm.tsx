"use client";

import "./projects.css";

import { useActionState, type ReactNode } from "react";
import type { ProjectActionState } from "~/server/actions/projects";
import { cn } from "~/lib/cn";
import { Button } from "~/ui/button";

const initialState: ProjectActionState = { ok: false, message: "" };

type Action = (
  previous: ProjectActionState,
  formData: FormData,
) => Promise<ProjectActionState>;

/**
 * One server action behind one button: hidden fields, optional extra fields
 * as children, and the outcome in words beside it. The console's small
 * decisions (approve with this advisor, add this member, archive) all use it.
 */
export default function ProjectActionForm({
  action,
  fields,
  label,
  variant = "secondary",
  children,
}: {
  action: Action;
  fields: Record<string, string>;
  label: string;
  variant?: "default" | "secondary" | "destructive";
  children?: ReactNode;
}) {
  const [state, run, pending] = useActionState(action, initialState);
  return (
    <form action={run} className="prj-inline">
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {children}
      <Button type="submit" size="sm" variant={variant} disabled={pending}>
        {label}
      </Button>
      {state.message && (
        <span
          className={cn("prj-status", state.ok ? "ok" : "bad")}
          role="status"
        >
          {state.message}
        </span>
      )}
    </form>
  );
}
