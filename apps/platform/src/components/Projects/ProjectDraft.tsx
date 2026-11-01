"use client";

import "./projects.css";

import { useState } from "react";
import { updateProjectAction } from "~/server/actions/projects";
import {
  normalizeProjectName,
  parseTags,
  PROJECT_DESCRIPTION_MAX,
  PROJECT_NAME_MAX,
  projectTextProblem,
} from "~/server/projects/policy";
import { Panel } from "~/ui/app-shell";
import Field from "~/ui/field";
import { Input } from "~/ui/input";
import {
  FieldError,
  SettingsFormProvider,
  useBlurredError,
  useSettingsField,
} from "~/ui/settings-form";
import SettingsSaveBar from "~/ui/settings-save-bar";
import { Textarea } from "~/ui/textarea";

/**
 * The editable fields of a project, held until Save or Discard (a Draft). The
 * server re-checks everything and who may edit; its words and per-field errors
 * come back through the save bar.
 */
export default function ProjectDraft({
  projectId,
  values,
}: {
  projectId: string;
  values: { name: string; description: string; tags: string[] };
}) {
  return (
    <SettingsFormProvider>
      <ProjectFields projectId={projectId} values={values} />
      <SettingsSaveBar />
    </SettingsFormProvider>
  );
}

function ProjectFields({
  projectId,
  values,
}: {
  projectId: string;
  values: { name: string; description: string; tags: string[] };
}) {
  const [saved, setSaved] = useState({
    name: values.name,
    description: values.description,
    tags: values.tags.join(", "),
  });
  const [name, setName] = useState(saved.name);
  const [description, setDescription] = useState(saved.description);
  const [tags, setTags] = useState(saved.tags);

  const problem = projectTextProblem(
    normalizeProjectName(name),
    description.trim(),
  );
  const tagProblem = parseTags(tags);
  const nameError = problem?.field === "name" ? problem.message : null;
  const descriptionError =
    problem?.field === "description" ? problem.message : null;
  const tagsError = tagProblem.ok ? null : tagProblem.message;

  const { isSaving, serverError } = useSettingsField({
    id: "project",
    label: "Project details",
    draft: [name, description, tags],
    isDirty:
      name !== saved.name ||
      description !== saved.description ||
      tags !== saved.tags,
    error: nameError ?? descriptionError ?? tagsError,
    reset: () => {
      setName(saved.name);
      setDescription(saved.description);
      setTags(saved.tags);
    },
    save: async () => {
      const outcome = await updateProjectAction(projectId, {
        name,
        description,
        tags,
      });
      if (outcome.ok) setSaved({ name, description, tags });
      return outcome;
    },
  });
  const shownName = useBlurredError(nameError);
  const shownDescription = useBlurredError(descriptionError);
  const shownTags = useBlurredError(tagsError);

  return (
    <Panel id="edit" title="Edit project">
      <div className="prj-form">
        <Field
          label="Project name"
          htmlFor="prj-edit-name"
          error={shownName.error}
        >
          <Input
            id="prj-edit-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={shownName.onBlur}
            disabled={isSaving}
            maxLength={PROJECT_NAME_MAX}
          />
        </Field>
        <Field
          label="What it is"
          htmlFor="prj-edit-description"
          error={shownDescription.error}
        >
          <Textarea
            id="prj-edit-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            onBlur={shownDescription.onBlur}
            disabled={isSaving}
            maxLength={PROJECT_DESCRIPTION_MAX}
            rows={4}
          />
        </Field>
        <Field
          label="Tags"
          htmlFor="prj-edit-tags"
          description="Comma-separated, up to 20."
          error={shownTags.error}
        >
          <Input
            id="prj-edit-tags"
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            onBlur={shownTags.onBlur}
            disabled={isSaving}
            maxLength={2000}
          />
        </Field>
        <FieldError error={serverError} />
      </div>
    </Panel>
  );
}
