"use client";

import type { Answer, Question } from "@devdogsuga/events";
import {
  startTransition,
  useActionState,
  useState,
  type FormEvent,
} from "react";
import "./participation/passport.css";
import { formatEventDateTime } from "~/lib/eventTime";
import { saveSurvey, type SurveyActionState } from "~/server/actions/survey";
import { ASKED, OTHER, fieldName, otherFieldName } from "~/lib/surveyFields";
import type { Survey, SurveyItem } from "~/server/survey/load";
import { WarningCircleIcon } from "@phosphor-icons/react/ssr";
import { Button } from "~/ui/button";
import { Card } from "~/ui/card";
import { Checkbox } from "~/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/ui/collapsible";
import { Input as TextInput } from "~/ui/input";
import { Textarea } from "~/ui/textarea";

const initialState: SurveyActionState = { ok: false, message: "" };

/**
 * The check-in survey, shown on /dashboard/attendance after a check-in.
 *
 * Unanswered member questions first, then this meeting's own, then the
 * member's saved answers folded away to edit. Every question shown posts an
 * `asked` marker, and the folded section stays mounted while closed, so a
 * save never mistakes a hidden field for a cleared one. Submitted without the
 * form's own reset, so a rejected save keeps what was typed; remounted (by
 * `key`) once saved answers change.
 */
export default function CheckInSurvey({ survey }: { survey: Survey }) {
  const answersKey = JSON.stringify([
    survey.unanswered,
    survey.saved,
    survey.meeting,
  ]);
  return <SurveyForm key={answersKey} survey={survey} />;
}

function SurveyForm({ survey }: { survey: Survey }) {
  const [state, action, pending] = useActionState(saveSurvey, initialState);
  const [showSaved, setShowSaved] = useState(false);
  // A rejected save names a folded-away answer: unfold so it can be seen.
  const savedError = survey.saved.some(
    (item) => state.errors?.[item.question.id],
  );

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => action(formData));
  }

  const open = [
    ...survey.unanswered,
    ...(survey.meetingOpen ? survey.meeting : []),
  ];
  return (
    <Card
      as="section"
      flat
      className="att-card att-wide att-survey"
      data-testid="checkin-survey"
    >
      <h2>A few questions</h2>
      <p className="att-note">
        About {survey.meetingLabel}. Your check-in is already recorded; these
        are optional unless marked required.
      </p>
      <form onSubmit={submit} className="att-sform" noValidate>
        <input type="hidden" name="meetingId" value={survey.meetingId} />
        {open.map((item) => (
          <QuestionField
            key={item.question.id}
            item={item}
            error={state.errors?.[item.question.id]}
          />
        ))}
        {!survey.meetingOpen && survey.meeting.length > 0 && (
          <p className="att-note">
            This meeting&rsquo;s questions closed{" "}
            {formatEventDateTime(survey.deadline)}.
          </p>
        )}
        {survey.saved.length > 0 && (
          <Collapsible
            open={showSaved || savedError}
            onOpenChange={setShowSaved}
          >
            <CollapsibleTrigger className="att-saved-toggle">
              Your saved answers ({survey.saved.length})
            </CollapsibleTrigger>
            <CollapsibleContent
              forceMount
              className="mt-4 flex flex-col gap-[22px] data-[state=closed]:hidden"
            >
              {survey.saved.map((item) => (
                <QuestionField
                  key={item.question.id}
                  item={item}
                  error={state.errors?.[item.question.id]}
                />
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}
        <div className="att-srow">
          <Button
            type="submit"
            variant="secondary"
            loading={pending}
            data-testid="survey-save"
          >
            Save answers
          </Button>
          {state.message && (
            <p className={`att-stat ${state.ok ? "ok" : "bad"}`} role="status">
              {state.message}
            </p>
          )}
        </div>
      </form>
    </Card>
  );
}

function QuestionField({
  item,
  error,
}: {
  item: SurveyItem;
  error: string | undefined;
}) {
  const { question, answer } = item;
  const id = `survey-${question.id}`;
  const errorId = `${id}-error`;
  return (
    <fieldset
      className="att-q"
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? errorId : undefined}
    >
      <input type="hidden" name={ASKED} value={question.id} />
      <legend className="text-base font-medium text-white">
        {question.prompt}
        {question.required && <span className="att-req">required</span>}
      </legend>
      {question.help && <p className="att-note -mt-1">{question.help}</p>}
      <Input question={question} answer={answer} id={id} />
      {error && (
        <p id={errorId} className="err">
          <WarningCircleIcon weight="fill" aria-hidden className="shrink-0" />
          {error}
        </p>
      )}
    </fieldset>
  );
}

function Input({
  question,
  answer,
  id,
}: {
  question: Question;
  answer: Answer | null;
  id: string;
}) {
  const name = fieldName(question.id);
  switch (question.type) {
    case "text":
      return (
        <TextInput
          id={id}
          name={name}
          aria-label={question.prompt}
          defaultValue={answer && "text" in answer ? answer.text : ""}
          maxLength={question.maxLength}
        />
      );
    case "longText":
      return (
        <Textarea
          id={id}
          name={name}
          aria-label={question.prompt}
          defaultValue={answer && "text" in answer ? answer.text : ""}
          maxLength={question.maxLength}
          rows={4}
        />
      );
    case "scale": {
      const chosen = answer && "value" in answer ? answer.value : null;
      const values = Array.from(
        { length: question.max - question.min + 1 },
        (_, i) => question.min + i,
      );
      return (
        <div className="att-scale">
          {question.minLabel && (
            <span className="att-note">{question.minLabel}</span>
          )}
          {values.map((value) => (
            <Checkbox
              key={value}
              type="radio"
              name={name}
              value={value}
              defaultChecked={chosen === value}
              label={value}
            />
          ))}
          {question.maxLabel && (
            <span className="att-note">{question.maxLabel}</span>
          )}
        </div>
      );
    }
    case "choice":
    case "multiChoice": {
      const multiple = question.type === "multiChoice";
      const picked = new Set(
        !answer
          ? []
          : "option" in answer
            ? [answer.option]
            : "options" in answer
              ? answer.options
              : [],
      );
      const otherText = answer && "other" in answer ? (answer.other ?? "") : "";
      // A retired option stays visible only where it is the saved answer.
      const options = question.options.filter(
        (o) => !o.retired || picked.has(o.id),
      );
      return (
        <div className="att-opts">
          {options.map((option) => (
            <Checkbox
              key={option.id}
              type={multiple ? "checkbox" : "radio"}
              name={name}
              value={option.id}
              defaultChecked={picked.has(option.id)}
              label={option.label}
            />
          ))}
          {question.other && (
            <div className="flex flex-wrap items-center gap-3">
              <Checkbox
                type={multiple ? "checkbox" : "radio"}
                name={name}
                value={OTHER}
                defaultChecked={otherText !== ""}
                label="Other"
              />
              <TextInput
                name={otherFieldName(question.id)}
                aria-label={`${question.prompt}: other`}
                defaultValue={otherText}
                className="max-w-xs"
              />
            </div>
          )}
        </div>
      );
    }
  }
}
