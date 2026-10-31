"use client";

import "./projects.css";

import { useState } from "react";
import { SHOWCASE_COLOR_KEYS, SHOWCASE_ICON_KEYS } from "~/config/showcaseKeys";
import { setProjectShowcase } from "~/server/actions/projectShowcase";
import type { ShowcaseFields } from "~/server/projects/load";
import {
  DISPLAY_ORDER_LIMIT,
  SHOWCASE_LIMITS,
} from "~/server/projects/showcasePolicy";
import { Panel } from "~/ui/app-shell";
import { Checkbox } from "~/ui/checkbox";
import Field from "~/ui/field";
import { Input } from "~/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/ui/select";
import {
  SettingsFormProvider,
  useBlurredError,
  useSettingsField,
} from "~/ui/settings-form";
import SettingsSaveBar from "~/ui/settings-save-bar";

/** Select items cannot be the empty string, so "no value" is this one. */
const NONE = "none";

/** The showcase fields as the form holds them: text for every box. */
interface ShowcaseForm {
  featured: boolean;
  inSwitcher: boolean;
  displayOrder: string;
  tagline: string;
  yearLabel: string;
  note: string;
  showcaseLabel: string;
  liveUrl: string;
  liveLabel: string;
  switcherUrl: string;
  switcherBlurb: string;
  iconKey: string;
  colorKey: string;
  contributionMode: string;
}

const formOf = (values: ShowcaseFields): ShowcaseForm => ({
  featured: values.featured,
  inSwitcher: values.inSwitcher,
  displayOrder: String(values.displayOrder),
  tagline: values.tagline ?? "",
  yearLabel: values.yearLabel ?? "",
  note: values.note ?? "",
  showcaseLabel: values.showcaseLabel ?? "",
  liveUrl: values.liveUrl ?? "",
  liveLabel: values.liveLabel ?? "",
  switcherUrl: values.switcherUrl ?? "",
  switcherBlurb: values.switcherBlurb ?? "",
  iconKey: values.iconKey ?? NONE,
  colorKey: values.colorKey ?? NONE,
  contributionMode: values.contributionMode ?? NONE,
});

/** What `setProjectShowcase` takes: blanks are sent as typed, the server clears them. */
const inputOf = (form: ShowcaseForm) => ({
  ...form,
  displayOrder: Number(form.displayOrder),
  iconKey: form.iconKey === NONE ? null : form.iconKey,
  colorKey: form.colorKey === NONE ? null : form.colorKey,
  contributionMode:
    form.contributionMode === NONE ? null : form.contributionMode,
});

/**
 * The officers' showcase fields for a project, held until Save or Discard (a
 * Draft). The server re-checks every field and who may edit; its words come
 * back through the save bar, and each field's own message appears under it
 * until that form changes.
 */
export default function ShowcaseDraft({
  projectId,
  values,
}: {
  projectId: string;
  values: ShowcaseFields;
}) {
  return (
    <SettingsFormProvider>
      <ShowcaseFieldset projectId={projectId} values={values} />
      <SettingsSaveBar />
    </SettingsFormProvider>
  );
}

function ShowcaseFieldset({
  projectId,
  values,
}: {
  projectId: string;
  values: ShowcaseFields;
}) {
  const [saved, setSaved] = useState(() => formOf(values));
  const [form, setForm] = useState(saved);
  const formKey = JSON.stringify(form);
  // The server's message for each field, kept only while the form is as it
  // was when the server refused it.
  const [refused, setRefused] = useState<{
    formKey: string;
    errors: Record<string, string>;
  } | null>(null);
  const serverErrors = refused?.formKey === formKey ? refused.errors : {};

  const set = <K extends keyof ShowcaseForm>(key: K, value: ShowcaseForm[K]) =>
    setForm((previous) => ({ ...previous, [key]: value }));

  const orderError = /^-?\d+$/u.test(form.displayOrder.trim())
    ? null
    : "Use a whole number.";

  const { isSaving } = useSettingsField({
    id: "showcase",
    label: "Showcase",
    draft: form,
    isDirty: formKey !== JSON.stringify(saved),
    error: orderError,
    reset: () => setForm(saved),
    save: async () => {
      const sent = form;
      const outcome = await setProjectShowcase(projectId, inputOf(sent));
      if (outcome.ok) setSaved(sent);
      else
        setRefused({
          formKey: JSON.stringify(sent),
          errors: outcome.fieldErrors ?? {},
        });
      return outcome;
    },
  });
  const shownOrder = useBlurredError(orderError);

  const text = (
    key: Exclude<
      keyof ShowcaseForm,
      "featured" | "inSwitcher" | "iconKey" | "colorKey" | "contributionMode"
    >,
    label: string,
    max: number,
    description?: string,
  ) => (
    <Field
      label={label}
      htmlFor={`prj-show-${key}`}
      description={description}
      error={serverErrors[key]}
    >
      <Input
        id={`prj-show-${key}`}
        value={form[key]}
        onChange={(event) => set(key, event.target.value)}
        disabled={isSaving}
        maxLength={max}
      />
    </Field>
  );

  const choice = (
    key: "iconKey" | "colorKey" | "contributionMode",
    label: string,
    options: readonly string[],
  ) => (
    <Field label={label} error={serverErrors[key]}>
      <Select
        value={form[key]}
        onValueChange={(value) => set(key, value)}
        disabled={isSaving}
      >
        <SelectTrigger aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>None</SelectItem>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );

  return (
    <Panel
      id="showcase"
      title="Showcase"
      help="Featured puts the project on the homepage and in the footer; In the app switcher puts it in the switcher. Only active projects are shown. Officers only."
    >
      <div className="prj-form">
        <Checkbox
          checked={form.featured}
          onChange={(event) => set("featured", event.currentTarget.checked)}
          disabled={isSaving}
          label="Featured on the homepage"
        />
        <Checkbox
          checked={form.inSwitcher}
          onChange={(event) => set("inSwitcher", event.currentTarget.checked)}
          disabled={isSaving}
          label="In the app switcher"
        />
        <Field
          label="Display order"
          htmlFor="prj-show-displayOrder"
          description={`Lowest first, from -${DISPLAY_ORDER_LIMIT} to ${DISPLAY_ORDER_LIMIT}.`}
          error={shownOrder.error ?? serverErrors.displayOrder}
        >
          <Input
            id="prj-show-displayOrder"
            inputMode="numeric"
            value={form.displayOrder}
            onChange={(event) => set("displayOrder", event.target.value)}
            onBlur={shownOrder.onBlur}
            disabled={isSaving}
          />
        </Field>
        {text("tagline", "Tagline", SHOWCASE_LIMITS.tagline)}
        {text("yearLabel", "Year label", SHOWCASE_LIMITS.yearLabel)}
        {text(
          "note",
          "Note",
          SHOWCASE_LIMITS.note,
          "A one-line caveat, such as why contributions are closed.",
        )}
        {text(
          "showcaseLabel",
          "Showcase label",
          SHOWCASE_LIMITS.showcaseLabel,
          "The status pill, such as “Public alpha”.",
        )}
        {text(
          "liveUrl",
          "Live URL",
          SHOWCASE_LIMITS.url,
          "An https:// address, or a path on this site.",
        )}
        {text(
          "liveLabel",
          "Live label",
          SHOWCASE_LIMITS.liveLabel,
          "What the live button says.",
        )}
        {text(
          "switcherUrl",
          "Switcher URL",
          SHOWCASE_LIMITS.url,
          "Where the switcher tile goes.",
        )}
        {text(
          "switcherBlurb",
          "Switcher blurb",
          SHOWCASE_LIMITS.switcherBlurb,
          "Two or three words under the tile’s name.",
        )}
        {choice("iconKey", "Icon", SHOWCASE_ICON_KEYS)}
        {choice("colorKey", "Color", SHOWCASE_COLOR_KEYS)}
        {choice("contributionMode", "Contribution mode", ["open", "closed"])}
      </div>
    </Panel>
  );
}
