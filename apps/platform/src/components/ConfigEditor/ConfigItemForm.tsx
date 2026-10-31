"use client";

import "./configEditor.css";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  resetConfigEditAction,
  saveConfigEditAction,
} from "~/server/actions/configEdits";
import type { FieldSpec } from "~/server/config/editFields";
import { Button } from "~/ui/button";
import Field from "~/ui/field";
import { Input } from "~/ui/input";
import { Textarea } from "~/ui/textarea";
import { SettingsFormProvider, useSettingsField } from "~/ui/settings-form";
import SettingsSaveBar from "~/ui/settings-save-bar";
import { CommandFeedback, useCommand } from "~/ui/use-command";

/** Each field's text, by field name. */
type Values = Readonly<Record<string, string>>;

export interface ConfigItemFormProps {
  collection: string;
  itemKey: string;
  /** "meeting", "workshop" or "venue", for the save bar's sentences. */
  singular: string;
  isNew: boolean;
  /** True once the item has a key (anything but the `new` page). */
  keyLocked: boolean;
  fields: readonly FieldSpec[];
  /** Each field's current text: the official value with the officer's saved edit over it. */
  values: Values;
  /** Each field's text in the official config, which Reset to official returns to. */
  officialValues: Values;
  /** Choices for selects that draw on another file (series, venues). */
  choices: Readonly<
    Record<string, readonly { value: string; label: string }[]>
  >;
  /** Whether the officer has a saved edit to reset. */
  hasEdit: boolean;
}

function Control({
  field,
  value,
  choices,
  locked,
  disabled,
  onChange,
}: {
  field: FieldSpec;
  value: string;
  choices: readonly { value: string; label: string }[];
  locked: boolean;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const id = `cfg-${field.name}`;
  if (field.kind === "select") {
    return (
      <span className="input select">
        <select
          id={id}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">{field.required ? "Choose" : "Inherit"}</option>
          {choices.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </select>
      </span>
    );
  }
  if (
    field.kind === "textarea" ||
    field.kind === "lines" ||
    field.kind === "agenda"
  ) {
    return (
      <Textarea
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        rows={field.kind === "textarea" ? 3 : 4}
      />
    );
  }
  return (
    <Input
      id={id}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      readOnly={locked}
      required={field.required}
      type={
        field.kind === "datetime"
          ? "datetime-local"
          : field.kind === "number"
            ? "number"
            : "text"
      }
      {...(field.kind === "number" ? { step: "0.25", min: "0.25" } : {})}
    />
  );
}

/**
 * Edits one meeting, workshop or venue. The item is one Draft field on the
 * page's save bar: the fields are checked and stored together, so a single
 * save keeps them consistent, and each problem the server finds shows under
 * its own control. Saving stores only what differs from the official config,
 * privately; nothing leaves the platform until the officer opens a pull
 * request from the list page. Reset to official is a Command beside the form.
 */
export default function ConfigItemForm(props: ConfigItemFormProps) {
  return (
    <SettingsFormProvider>
      <ItemEditor {...props} />
      <SettingsSaveBar />
    </SettingsFormProvider>
  );
}

function ItemEditor({
  collection,
  itemKey,
  singular,
  isNew,
  keyLocked,
  fields,
  values,
  officialValues,
  choices,
  hasEdit,
}: ConfigItemFormProps) {
  const router = useRouter();
  // A new item has nothing saved to compare with, so every field starts empty.
  const [saved, setSaved] = useState<Values>(() =>
    keyLocked
      ? values
      : Object.fromEntries(fields.map((field) => [field.name, ""])),
  );
  const [draft, setDraft] = useState<Values>(saved);
  const [refused, setRefused] = useState<{
    draftKey: string;
    errors: Record<string, string>;
  } | null>(null);

  const draftKey = JSON.stringify(draft);
  // A server error belongs to the text that earned it; editing clears it.
  const errors = refused?.draftKey === draftKey ? refused.errors : {};

  const { isSaving } = useSettingsField({
    id: "configItem",
    label: `${singular.charAt(0).toUpperCase()}${singular.slice(1)} details`,
    draft,
    isDirty: fields.some((field) => draft[field.name] !== saved[field.name]),
    error: null,
    reset: () => setDraft(saved),
    save: async () => {
      const result = await saveConfigEditAction({
        collection,
        key: itemKey,
        isNew,
        values: draft,
      });
      if (result.ok) {
        setSaved(draft);
        router.refresh();
      } else if (result.fieldErrors) {
        setRefused({ draftKey, errors: result.fieldErrors });
      }
      return result;
    },
  });

  const reset = useCommand(async () => {
    const result = await resetConfigEditAction(collection, itemKey);
    if (result.ok) {
      setSaved(officialValues);
      setDraft(officialValues);
    }
    return result;
  });

  return (
    <div className="cfg-stack">
      <div className="cfg-form">
        {fields.map((field) => (
          <Field
            key={field.name}
            label={field.label}
            htmlFor={`cfg-${field.name}`}
            required={field.required}
            error={errors[field.name] ?? null}
            {...(field.help ? { description: field.help } : {})}
          >
            <Control
              field={field}
              value={draft[field.name] ?? ""}
              choices={
                field.options ??
                (field.optionsFrom ? (choices[field.optionsFrom] ?? []) : [])
              }
              locked={Boolean(field.isKey) && keyLocked}
              disabled={isSaving}
              onChange={(value) =>
                setDraft((current) => ({ ...current, [field.name]: value }))
              }
            />
          </Field>
        ))}
      </div>
      {hasEdit && (
        <div className="cfg-actions">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={reset.pending}
            onClick={() => reset.run()}
          >
            Reset to official
          </Button>
          <CommandFeedback result={reset.result} />
        </div>
      )}
    </div>
  );
}
