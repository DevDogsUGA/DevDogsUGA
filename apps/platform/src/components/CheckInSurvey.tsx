"use client";

import type { Answer, Question } from "@devdogsuga/events";
import {
  startTransition,
  useActionState,
  useState,
  type FormEvent,
} from "react";
import { formatEventDateTime } from "~/lib/eventTime";
import { saveSurvey, type SurveyActionState } from "~/server/actions/survey";
import { ASKED, OTHER, fieldName, otherFieldName } from "~/lib/surveyFields";
import type { Survey, SurveyItem } from "~/server/survey/load";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/ui/collapsible";

const initialState: SurveyActionState = { ok: false, message: "" };

const inputClass =
  "w-full rounded-md border border-mauve-700 bg-mauve-900 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/30";

/**
 * The check-in survey, shown on /attendance after a check-in.
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
    <section className="rounded-xl border-2 border-mauve-800 bg-mauve-950 px-6 py-6 shadow-lg shadow-black/30">
      <h2 className="text-lg font-semibold text-white">A few questions</h2>
      <p className="mt-1 text-sm text-mauve-400">
        About {survey.meetingLabel}. Your check-in is already recorded; these
        are optional unless marked required.
      </p>
      <form onSubmit={submit} className="mt-6 grid gap-6" noValidate>
        <input type="hidden" name="meetingId" value={survey.meetingId} />
        {open.map((item) => (
          <QuestionField
            key={item.question.id}
            item={item}
            error={state.errors?.[item.question.id]}
          />
        ))}
        {!survey.meetingOpen && survey.meeting.length > 0 && (
          <p className="text-sm text-mauve-400">
            This meeting&rsquo;s questions closed{" "}
            {formatEventDateTime(survey.deadline)}.
          </p>
        )}
        {survey.saved.length > 0 && (
          <Collapsible
            open={showSaved || savedError}
            onOpenChange={setShowSaved}
          >
            <CollapsibleTrigger className="text-sm font-medium text-cyan-300 hover:text-cyan-200">
              Your saved answers ({survey.saved.length})
            </CollapsibleTrigger>
            <CollapsibleContent
              forceMount
              className="mt-4 grid gap-6 data-[state=closed]:hidden"
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
        <div className="flex flex-wrap items-center gap-3">
          <button
            disabled={pending}
            className="rounded-sm bg-cyan-400 px-4 py-1.5 text-sm font-medium text-black disabled:opacity-50"
          >
            Save answers
          </button>
          {state.message && (
            <p
              className={`text-sm ${state.ok ? "text-cyan-300" : "text-rose-300"}`}
              role="status"
            >
              {state.message}
            </p>
          )}
        </div>
      </form>
    </section>
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
      className="grid gap-2.5"
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? errorId : undefined}
    >
      <input type="hidden" name={ASKED} value={question.id} />
      <legend className="text-base font-medium text-white">
        {question.prompt}
        {question.required && (
          <span className="ml-2 text-xs font-normal text-mauve-400">
            required
          </span>
        )}
      </legend>
      {question.help && (
        <p className="-mt-1 text-xs text-mauve-300">{question.help}</p>
      )}
      <Input question={question} answer={answer} id={id} />
      {error && (
        <p id={errorId} className="text-sm text-rose-300">
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
        <input
          id={id}
          name={name}
          aria-label={question.prompt}
          defaultValue={answer && "text" in answer ? answer.text : ""}
          maxLength={question.maxLength}
          className={inputClass}
        />
      );
    case "longText":
      return (
        <textarea
          id={id}
          name={name}
          aria-label={question.prompt}
          defaultValue={answer && "text" in answer ? answer.text : ""}
          maxLength={question.maxLength}
          rows={4}
          className={inputClass}
        />
      );
    case "scale": {
      const chosen = answer && "value" in answer ? answer.value : null;
      const values = Array.from(
        { length: question.max - question.min + 1 },
        (_, i) => question.min + i,
      );
      return (
        <div className="flex flex-wrap items-center gap-3 text-sm text-mauve-200">
          {question.minLabel && <span>{question.minLabel}</span>}
          {values.map((value) => (
            <label key={value} className="flex items-center gap-1.5">
              <input
                type="radio"
                name={name}
                value={value}
                defaultChecked={chosen === value}
                className="accent-cyan-400"
              />
              {value}
            </label>
          ))}
          {question.maxLabel && <span>{question.maxLabel}</span>}
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
        <div className="grid gap-2 text-sm text-mauve-200">
          {options.map((option) => (
            <label key={option.id} className="flex items-center gap-2">
              <input
                type={multiple ? "checkbox" : "radio"}
                name={name}
                value={option.id}
                defaultChecked={picked.has(option.id)}
                className="accent-cyan-400"
              />
              {option.label}
            </label>
          ))}
          {question.other && (
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2">
                <input
                  type={multiple ? "checkbox" : "radio"}
                  name={name}
                  value={OTHER}
                  defaultChecked={otherText !== ""}
                  className="accent-cyan-400"
                />
                Other
              </label>
              <input
                name={otherFieldName(question.id)}
                aria-label={`${question.prompt}: other`}
                defaultValue={otherText}
                className={`${inputClass} max-w-xs`}
              />
            </div>
          )}
        </div>
      );
    }
  }
}
