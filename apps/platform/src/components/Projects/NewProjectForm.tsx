"use client";

import "./projects.css";

import { createProjectAction } from "~/server/actions/projects";
import {
  PROJECT_DESCRIPTION_MAX,
  PROJECT_NAME_MAX,
} from "~/server/projects/policy";
import { projectPath } from "~/server/projects/slug";
import { Button } from "~/ui/button";
import Callout from "~/ui/callout";
import Field from "~/ui/field";
import { Input } from "~/ui/input";
import { Textarea } from "~/ui/textarea";
import { TextLink } from "~/ui/text-link";
import { CommandFeedback, useCommand } from "~/ui/use-command";

/**
 * Create a project: a name, a description, tags and at least one repo. Each
 * repo is checked for control when the form is sent, and a refusal appears
 * under the repo box with the repo's name on it.
 */
export default function NewProjectForm() {
  const { run, pending, result } = useCommand(createProjectAction);
  const errors = result && !result.ok ? (result.fieldErrors ?? {}) : {};
  const created = result?.ok ? result.data : undefined;
  return (
    <form action={run} className="prj-form">
      <Field
        label="Project name"
        htmlFor="prj-name"
        required
        error={errors.name}
      >
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
        error={errors.description}
      >
        <Textarea
          id="prj-description"
          name="description"
          maxLength={PROJECT_DESCRIPTION_MAX}
          rows={4}
        />
      </Field>
      <Field
        label="Tags"
        htmlFor="prj-tags"
        description="Comma-separated, up to 20."
        error={errors.tags}
      >
        <Input id="prj-tags" name="tags" maxLength={2000} />
      </Field>
      <Field
        label="Repositories"
        htmlFor="prj-repos"
        description="owner/name, one per line or separated by commas; at least one, public. A repo of yours, or a DevDogsUGA repo you can write to, is approved at once. A repo in any other organization waits for an officer, and the project stays archived until one is approved."
        required
        error={errors.repos}
      >
        <Textarea
          id="prj-repos"
          name="repos"
          required
          maxLength={2000}
          rows={3}
        />
      </Field>
      <div>
        <Button type="submit" size="sm" disabled={pending}>
          Create project
        </Button>
      </div>
      {Object.keys(errors).length === 0 && <CommandFeedback result={result} />}
      {created && (
        <Callout
          tone={created.status === "active" ? "success" : "warning"}
          title={
            created.status === "active"
              ? "Project created"
              : "Waiting on an officer"
          }
        >
          {created.status === "active"
            ? "Your project is active. "
            : "Every repository is waiting for an officer to approve it, so the project is archived until then. "}
          <TextLink
            href={projectPath({ slug: created.slug, id: created.projectId })}
          >
            Open the project
          </TextLink>
        </Callout>
      )}
    </form>
  );
}
