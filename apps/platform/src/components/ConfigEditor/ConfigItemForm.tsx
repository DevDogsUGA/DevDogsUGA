"use client";

import "./configEditor.css";

import { useActionState } from "react";
import {
  resetConfigEditAction,
  saveConfigEditAction,
  type ConfigActionState,
} from "~/server/actions/configEdits";
import type { FieldSpec } from "~/server/config/editFields";
import { cn } from "~/lib/cn";
import { Button } from "~/ui/button";
import Field from "~/ui/field";
import { Input } from "~/ui/input";
import { Textarea } from "~/ui/textarea";

const initialState: ConfigActionState = { ok: false, message: "" };

export interface ConfigItemFormProps {
  collection: string;
  itemKey: string;
  isNew: boolean;
  /** True once the item has a key (anything but the `new` page). */
  keyLocked: boolean;
  fields: readonly FieldSpec[];
  /** Each field's current text: the official value with the officer's saved edit over it. */
  values: Readonly<Record<string, string>>;
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
}: {
  field: FieldSpec;
  value: string;
  choices: readonly { value: string; label: string }[];
  locked: boolean;
}) {
  const id = `cfg-${field.name}`;
  const name = `f_${field.name}`;
  if (field.kind === "select") {
    return (
      <span className="input select">
        <select id={id} name={name} defaultValue={value}>
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
        name={name}
        defaultValue={value}
        rows={field.kind === "textarea" ? 3 : 4}
      />
    );
  }
  return (
    <Input
      id={id}
      name={name}
      defaultValue={value}
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
 * Edits one meeting, workshop or venue. Saving stores only what differs from
 * the official config, privately; nothing leaves the platform until the
 * officer opens a pull request from the list page.
 */
export default function ConfigItemForm({
  collection,
  itemKey,
  isNew,
  keyLocked,
  fields,
  values,
  choices,
  hasEdit,
}: ConfigItemFormProps) {
  const [state, save, saving] = useActionState(
    saveConfigEditAction,
    initialState,
  );
  const [resetState, reset, resetting] = useActionState(
    resetConfigEditAction,
    initialState,
  );
  return (
    <div className="cfg-stack">
      <form action={save} className="cfg-form">
        <input type="hidden" name="collection" value={collection} />
        <input type="hidden" name="key" value={itemKey} />
        {isNew && <input type="hidden" name="isNew" value="1" />}
        {fields.map((field) => (
          <Field
            key={field.name}
            label={field.label}
            htmlFor={`cfg-${field.name}`}
            required={field.required}
            {...(field.help ? { description: field.help } : {})}
          >
            <Control
              field={field}
              value={values[field.name] ?? ""}
              choices={
                field.options ??
                (field.optionsFrom ? (choices[field.optionsFrom] ?? []) : [])
              }
              locked={Boolean(field.isKey) && keyLocked}
            />
          </Field>
        ))}
        <div className="cfg-actions">
          <Button type="submit" size="sm" disabled={saving}>
            Save edits
          </Button>
          {state.message && (
            <p
              className={cn("cfg-status", state.ok ? "ok" : "bad")}
              role="status"
            >
              {state.message}
            </p>
          )}
        </div>
      </form>
      {hasEdit && (
        <form action={reset} className="cfg-actions">
          <input type="hidden" name="collection" value={collection} />
          <input type="hidden" name="key" value={itemKey} />
          <Button
            type="submit"
            size="sm"
            variant="secondary"
            disabled={resetting}
          >
            Reset to official
          </Button>
          {resetState.message && (
            <p
              className={cn("cfg-status", resetState.ok ? "ok" : "bad")}
              role="status"
            >
              {resetState.message}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
