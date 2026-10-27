"use client";

import { useState } from "react";
import {
  CheckIcon,
  LockIcon,
  MagnifyingGlassIcon,
} from "@phosphor-icons/react/ssr";
import Input from "~/components/Input";
import NativeSelect from "~/components/Select";
import { CodeInput } from "~/ui/code-input";
import { Checkbox, Radio } from "~/ui/checkbox";
import { LB_FRAME, LB_ITEM } from "~/ui/combobox";
import { CopyField } from "~/ui/copy-field";
import Field from "~/ui/field";
import { Input as FramedInput } from "~/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
} from "~/ui/input-group";
import { Segmented } from "~/ui/segmented";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "~/ui/select";
import { SettingsSaveBarView } from "~/ui/settings-save-bar";
import Toggle from "~/ui/switch";
import { Textarea } from "~/ui/textarea";
import VisibilityToggle from "~/ui/visibility-toggle";
import { KIT_GROUPS } from "../groups";

const note = (title: string) =>
  KIT_GROUPS.find((g) => g.title === title)?.note ?? "";

function Group({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grp" id={title.toLowerCase().replace(/\W+/g, "-")}>
      <h2>{title}</h2>
      <p dangerouslySetInnerHTML={{ __html: intro ?? note(title) }} />
      <div className="pair">
        <div className="pane cosmic" data-label="Cosmic · DevDogs">
          {children}
        </div>
      </div>
    </section>
  );
}

const noop = () => undefined;

const MONTHS = ["Spring 2027", "Fall 2027", "Spring 2028"];

/** Every state of the live field primitives. */
/** A select-all over three options: mixed while some, not all, are picked. */
function MixedCheckExample() {
  const options = ["Workshops", "Socials", "Competitions"];
  const [picked, setPicked] = useState<string[]>(["Workshops"]);
  const all = picked.length === options.length;
  return (
    <div className="col" style={{ gap: 10 }}>
      <Checkbox
        label="All event emails"
        checked={all}
        indeterminate={picked.length > 0 && !all}
        onChange={() => setPicked(all ? [] : options)}
      />
      <div className="col" style={{ gap: 10, paddingLeft: 30 }}>
        {options.map((o) => (
          <Checkbox
            key={o}
            label={o}
            checked={picked.includes(o)}
            onChange={() =>
              setPicked((cur) =>
                cur.includes(o) ? cur.filter((x) => x !== o) : [...cur, o],
              )
            }
          />
        ))}
      </div>
    </div>
  );
}

export default function FieldsSection() {
  return (
    <>
      <Group title="Form fields">
        <div className="g2 grid" data-kind="build" style={{ gap: "18px 20px" }}>
          <Field
            label="Preferred name"
            description="Shown on your profile and check-ins."
            htmlFor="g-name"
          >
            <FramedInput
              id="g-name"
              defaultValue="Sloan"
              autoComplete="given-name"
            />
          </Field>
          <Field label="Handle" htmlFor="g-handle" count="5 / 30">
            <InputGroup className="focus">
              <InputGroupAddon>
                <InputGroupText>@</InputGroupText>
              </InputGroupAddon>
              <InputGroupInput id="g-handle" defaultValue="sloan" />
              <InputGroupAddon align="inline-end">
                <span className="ok">
                  <CheckIcon weight="bold" aria-hidden /> Available
                </span>
              </InputGroupAddon>
            </InputGroup>
          </Field>
          <Field
            label="UGA email"
            htmlFor="g-email"
            required
            error="Use your @uga.edu address."
          >
            <FramedInput
              id="g-email"
              type="email"
              defaultValue="sloan@gmail.com"
              aria-invalid="true"
            />
          </Field>
          <Field label="Graduation" htmlFor="g-grad">
            <Select defaultValue="spring-2027">
              <SelectTrigger id="g-grad">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((m) => (
                  <SelectItem key={m} value={m.toLowerCase().replace(" ", "-")}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div style={{ gridColumn: "span 2" }}>
            <Field label="Bio" htmlFor="g-bio" count="0 / 240">
              <Textarea
                id="g-bio"
                placeholder="What are you building this semester?"
              />
            </Field>
          </div>
          <div className="col" style={{ gap: 10 }}>
            <Checkbox
              defaultChecked
              label="Show me in the community directory"
            />
            <Checkbox label="Email me the GDGC newsletter" />
          </div>
          <div
            className="col"
            style={{ gap: 10 }}
            role="radiogroup"
            aria-label="Attendance"
          >
            <Radio name="g-att" defaultChecked label="In person" />
            <Radio name="g-att" label="Online" />
          </div>
          <div className="row">
            <Toggle
              checked
              name="pub"
              pending={false}
              aria-label="Public profile"
            />
            <span className="small">Public profile</span>
          </div>
          <div>
            <Segmented
              aria-label="Events view"
              options={[
                { value: "upcoming", label: "Upcoming" },
                { value: "past", label: "Past" },
                { value: "all", label: "All" },
              ]}
              defaultValue="upcoming"
            />
          </div>
        </div>
      </Group>

      <Group
        title="Input states"
        intro="Every state of <code>Input</code>, <code>Textarea</code> and the framed select trigger. Invalid is <code>aria-invalid</code> plus an <code>.err</code> line with an icon, never colour alone. Focus is forced here with the kit's <code>.focus</code> helper."
      >
        <div className="g2 grid" data-kind="build" style={{ gap: "18px 20px" }}>
          <Field label="Rest" htmlFor="s-rest">
            <FramedInput id="s-rest" defaultValue="Sloan" />
          </Field>
          <Field label="Placeholder" htmlFor="s-ph">
            <FramedInput id="s-ph" placeholder="you@uga.edu" />
          </Field>
          <Field label="Focus (forced)" htmlFor="s-focus">
            <FramedInput
              id="s-focus"
              className="focus"
              defaultValue="Typing here"
            />
          </Field>
          <Field
            label="Invalid"
            htmlFor="s-bad"
            error="Enter a preferred name."
          >
            <FramedInput id="s-bad" aria-invalid="true" defaultValue="" />
          </Field>
          <Field label="Disabled" htmlFor="s-dis">
            <FramedInput
              id="s-dis"
              disabled
              defaultValue="Locked by your school"
            />
          </Field>
          <Field label="Read only, mono" htmlFor="s-ro">
            <FramedInput
              id="s-ro"
              readOnly
              className="mono"
              defaultValue="3f9c-41ab-be12"
            />
          </Field>
          <Field label="Disabled with lock" htmlFor="s-lock">
            <Input id="s-lock" disabled value="sloan@uga.edu" readOnly />
          </Field>
          <Field label="Mono input" htmlFor="s-mono">
            <Input id="s-mono" mono defaultValue="client_01HZX9" />
          </Field>
          <Field
            label="Textarea, invalid"
            htmlFor="s-area-bad"
            error="Over 240 characters."
            count="251 / 240"
          >
            <Textarea
              id="s-area-bad"
              aria-invalid="true"
              defaultValue="Building a campus tool for sharing rides to football games and a very long description that goes on."
            />
          </Field>
          <Field label="Textarea, capped at max-h-32" htmlFor="s-area-cap">
            <Textarea
              id="s-area-cap"
              className="max-h-32"
              defaultValue={"A long reply that runs past the cap.\n".repeat(12)}
            />
          </Field>
          <Field label="Textarea, disabled" htmlFor="s-area-dis">
            <Textarea
              id="s-area-dis"
              disabled
              defaultValue="Read-only for now."
            />
          </Field>
          <Field
            label="Select, invalid"
            htmlFor="s-sel-bad"
            error="Pick a term."
          >
            <Select>
              <SelectTrigger id="s-sel-bad" aria-invalid="true">
                <SelectValue placeholder="Pick a term" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="a">Spring 2027</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Select, disabled" htmlFor="s-sel-dis">
            <Select disabled defaultValue="a">
              <SelectTrigger id="s-sel-dis">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="a">Spring 2027</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Select, placeholder" htmlFor="s-sel-ph">
            <Select>
              <SelectTrigger id="s-sel-ph">
                <SelectValue placeholder="Choose a pronoun set" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Common</SelectLabel>
                  <SelectItem value="a">she/her</SelectItem>
                  <SelectItem value="b">he/him</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Select (custom, shared look)" htmlFor="s-nsel">
            <NativeSelect defaultValue="b" placeholder="Pick one">
              <NativeSelect.Item value="a">Rounded</NativeSelect.Item>
              <NativeSelect.Item value="b">Square</NativeSelect.Item>
            </NativeSelect>
          </Field>
        </div>
      </Group>

      <Group
        title="Open list"
        intro="The open list wears the list-box frame (<code>.lb</code>). Rows tint whole on hover or keyboard highlight, the chosen row keeps a brand tint, disabled rows dim. Static here because a portalled list cannot be held open in a screenshot."
      >
        <div className="g2 grid" data-kind="build" style={{ gap: "18px 20px" }}>
          <div
            className={`${LB_FRAME} w-full max-w-72`}
            role="listbox"
            aria-label="Graduation, open"
          >
            <div className={LB_ITEM}>Spring 2027</div>
            <div className={LB_ITEM} data-highlighted>
              Fall 2027 (highlighted)
            </div>
            <div className={LB_ITEM} data-state="checked">
              Spring 2028 (chosen)
              <CheckIcon weight="bold" className="ml-auto text-[var(--k3)]" />
            </div>
            <div className={LB_ITEM} data-disabled>
              Fall 2028 (disabled)
            </div>
          </div>
        </div>
      </Group>

      <Group
        title="Checks, switches and segments"
        intro="Real <code>input</code>s drive the check and the segmented control, so keyboard and form behaviour are native. The switch is a submit button with <code>role=switch</code>; pending keeps the knob still and turns a spinner in it."
      >
        <div
          className="g2 grid"
          data-kind="workshop"
          style={{ gap: "18px 20px" }}
        >
          <div className="col" style={{ gap: 10 }}>
            <Checkbox defaultChecked label="Checked" />
            <Checkbox label="Unchecked" />
            <Checkbox defaultChecked disabled label="Checked, disabled" />
            <Checkbox disabled label="Unchecked, disabled" />
            <Checkbox aria-invalid label="Unchecked, invalid" />
            <Checkbox aria-label="Bare box, no text" />
            <MixedCheckExample />
          </div>
          <div
            className="col"
            style={{ gap: 10 }}
            role="radiogroup"
            aria-label="Format"
          >
            <Radio name="g-fmt" defaultChecked label="Selected" />
            <Radio name="g-fmt" label="Not selected" />
            <Radio name="g-fmt" disabled label="Disabled" />
          </div>
          <div className="col" style={{ gap: 12 }}>
            <div className="row">
              <Toggle checked={false} pending={false} aria-label="Off" />
              <span className="small">Off</span>
            </div>
            <div className="row">
              <Toggle checked pending={false} aria-label="On" />
              <span className="small">On</span>
            </div>
            <div className="row">
              <Toggle
                checked={false}
                pending
                aria-label="Off, saving"
                disabled
              />
              <span className="small">Off, pending</span>
            </div>
            <div className="row">
              <Toggle checked pending aria-label="On, saving" disabled />
              <span className="small">On, pending</span>
            </div>
            <div className="row">
              <Toggle
                checked={false}
                pending={false}
                disabled
                aria-label="Disabled"
              />
              <span className="small">Disabled</span>
            </div>
          </div>
          <div className="col" style={{ gap: 14 }}>
            <VisibilityToggle checked pending={false} onToggle={noop} />
            <VisibilityToggle
              checked={false}
              pending={false}
              onToggle={noop}
              label="Show my email"
            />
            <VisibilityToggle checked pending onToggle={noop} />
            <Segmented
              aria-label="Filter"
              options={[
                { value: "a", label: "Upcoming" },
                { value: "b", label: "Past" },
                { value: "c", label: "All", disabled: true },
              ]}
              defaultValue="b"
            />
            <Segmented
              aria-label="Events layout"
              value="list"
              options={[
                {
                  value: "list",
                  label: "List",
                  href: "#checks-switches-and-segments",
                },
                {
                  value: "month",
                  label: "Month",
                  href: "#checks-switches-and-segments",
                },
              ]}
            />
          </div>
        </div>
      </Group>

      <Group
        title="Input groups and copy"
        intro="Addons sit inside one <code>.input</code> frame: a leading <code>@</code>, a trailing unit, a button. The copy field's button flips to a check for two seconds."
      >
        <div
          className="g2 grid"
          data-kind="social"
          style={{ gap: "18px 20px" }}
        >
          <Field label="Search" htmlFor="ig-search">
            <InputGroup>
              <InputGroupAddon>
                <MagnifyingGlassIcon aria-hidden />
              </InputGroupAddon>
              <InputGroupInput id="ig-search" placeholder="Search events" />
            </InputGroup>
          </Field>
          <Field label="Capacity" htmlFor="ig-cap">
            <InputGroup>
              <InputGroupInput
                id="ig-cap"
                inputMode="numeric"
                defaultValue="40"
              />
              <InputGroupAddon align="inline-end">
                <InputGroupText>seats</InputGroupText>
              </InputGroupAddon>
            </InputGroup>
          </Field>
          <Field label="Link" htmlFor="ig-link">
            <InputGroup>
              <InputGroupInput
                id="ig-link"
                defaultValue="https://devdogsuga.org"
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton variant="outline">Paste</InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          </Field>
          <Field
            label="Group, invalid"
            htmlFor="ig-bad"
            error="Handles use letters and numbers."
          >
            <InputGroup>
              <InputGroupAddon>
                <InputGroupText>@</InputGroupText>
              </InputGroupAddon>
              <InputGroupInput
                id="ig-bad"
                aria-invalid="true"
                defaultValue="sloan!"
              />
            </InputGroup>
          </Field>
          <Field label="Group with textarea" htmlFor="ig-area">
            <InputGroup>
              <InputGroupTextarea
                id="ig-area"
                placeholder="Reason for the report"
              />
            </InputGroup>
          </Field>
          <Field label="Client ID (copy field)" htmlFor="cf-1">
            <CopyField value="dd_01HZX9QK4N2" aria-label="Client ID" />
          </Field>
          <Field label="Issuer (copy, via Input)" htmlFor="cf-2">
            <Input
              mono
              copy
              id="cf-2"
              value="https://api.devdogsuga.org/auth/v1"
            />
          </Field>
          <Field label="Disabled with lock" htmlFor="cf-3">
            <span className="input">
              <LockIcon aria-hidden className="text-[var(--text-3)]" />
              <input id="cf-3" disabled defaultValue="Managed by UGA" />
            </span>
          </Field>
        </div>
      </Group>

      <Group
        title="Code input"
        intro="One <code>.input</code> cell per character: numeric keypad and <code>one-time-code</code> autofill, paste fills the row, backspace walks back. The device code is eight characters shown <code>XXXX-XXXX</code>. Each cell is announced as &ldquo;Digit 3 of 6&rdquo;."
      >
        <div className="col" data-kind="build" style={{ gap: 18 }}>
          <Field label="Meeting code, empty">
            <CodeInput aria-label="Meeting code" name="meeting-empty" />
          </Field>
          <Field label="Meeting code, filled">
            <CodeInput
              aria-label="Meeting code, filled"
              defaultValue="428613"
            />
          </Field>
          <Field label="Meeting code, partial">
            <CodeInput aria-label="Meeting code, partial" defaultValue="428" />
          </Field>
          <Field
            label="Meeting code, invalid"
            error="That code isn't active. Check the projector."
          >
            <CodeInput
              aria-label="Meeting code, invalid"
              defaultValue="000000"
              invalid
            />
          </Field>
          <Field label="Device code">
            <CodeInput
              aria-label="Device code"
              length={8}
              defaultValue="K7QD42"
            />
          </Field>
          <Field label="Disabled">
            <CodeInput
              aria-label="Disabled code"
              defaultValue="123456"
              disabled
            />
          </Field>
        </div>
      </Group>

      <Group
        title="Save bar"
        intro="One save model per page. The five states of <code>SettingsSaveBar</code> drawn from stub props (the live bar reads the form context and is fixed to the viewport), plus the blocked state when a dirty field is invalid."
      >
        <div className="col" data-kind="build" style={{ gap: 18 }}>
          {(
            [
              ["Dirty", { status: "dirty", dirtyCount: 3 }],
              [
                "Blocked by an invalid field",
                {
                  status: "blocked",
                  dirtyCount: 2,
                  invalidLabels: ["Preferred name", "Bio"],
                },
              ],
              ["Saving", { status: "saving", dirtyCount: 3, isSaving: true }],
              [
                "Saved",
                {
                  status: "saved",
                  dirtyCount: 0,
                  message: "Public profile updated.",
                },
              ],
              [
                "Error",
                {
                  status: "error",
                  dirtyCount: 1,
                  message: "Couldn’t save Bio. Nothing was lost; try again.",
                },
              ],
            ] as const
          ).map(([name, state]) => (
            <div key={name}>
              <div className="eyebrow" style={{ marginBottom: 8 }}>
                {name}
              </div>
              <SettingsSaveBarView
                isSaving={false}
                onSave={noop}
                onReset={noop}
                inline
                {...state}
                invalidLabels={
                  "invalidLabels" in state ? [...state.invalidLabels] : []
                }
              />
            </div>
          ))}
        </div>
      </Group>
    </>
  );
}
