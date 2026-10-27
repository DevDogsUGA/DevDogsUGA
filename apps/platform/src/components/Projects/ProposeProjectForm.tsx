"use client";

import "./projects.css";

import { useActionState } from "react";
import {
  proposeProjectAction,
  type ProjectActionState,
} from "~/server/actions/projects";
import {
  PROJECT_DESCRIPTION_MAX,
  PROJECT_NAME_MAX,
} from "~/server/projects/policy";
import { cn } from "~/lib/cn";
import { Button } from "~/ui/button";
import Field from "~/ui/field";
import { Input } from "~/ui/input";
import { Textarea } from "~/ui/textarea";

const initialState: ProjectActionState = { ok: false, message: "" };

/** A member proposes a project; leadership approves it and assigns an advisor. */
export default function ProposeProjectForm() {
  const [state, action, pending] = useActionState(
    proposeProjectAction,
    initialState,
  );
  return (
    <form action={action} className="prj-form">
      <Field label="Project name" htmlFor="prj-name" required>
        <Input
          id="prj-name"
          name="name"
          required
          minLength={2}
          maxLength={PROJECT_NAME_MAX}
        />
      </Field>
      <Field
        label="What it is"
        htmlFor="prj-description"
        description="A few sentences on what the project builds and who it is for."
      >
        <Textarea
          id="prj-description"
          name="description"
          maxLength={PROJECT_DESCRIPTION_MAX}
          rows={4}
        />
      </Field>
      <Field
        label="Repositories"
        htmlFor="prj-repos"
        description="owner/name, one per line or separated by commas. Access is set in GitHub, not here."
      >
        <Textarea id="prj-repos" name="repos" maxLength={2000} rows={3} />
      </Field>
      <div>
        <Button type="submit" size="sm" disabled={pending}>
          Propose project
        </Button>
      </div>
      {state.message && (
        <p className={cn("prj-status", state.ok ? "ok" : "bad")} role="status">
          {state.message}
        </p>
      )}
    </form>
  );
}
