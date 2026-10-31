"use client";

import "./projects.css";

import { useState } from "react";
import {
  deleteSubmission,
  recordSubmission,
  updateSubmission,
} from "~/server/actions/submissions";
import { RESULT_MAX } from "~/server/submissions/policy";
import { Button } from "~/ui/button";
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
import { Textarea } from "~/ui/textarea";
import { TextLink } from "~/ui/text-link";
import { CommandFeedback, useCommand } from "~/ui/use-command";
import { ProjectCommand } from "./ProjectCommands";

/** A member a Submission's team may include. */
export interface TeamMember {
  userId: string;
  name: string | null;
}

/** An approved Hackathon, as the record form's list offers it. */
export interface HackathonChoice {
  id: string;
  name: string;
  when: string | null;
}

/** A recorded Submission, as the owner's controls need it. */
export interface RecordedSubmission {
  id: string;
  url: string;
  result: string | null;
  team: string[];
  teamUserIds: string[];
}

const memberName = (member: TeamMember) => member.name ?? "Member";

/**
 * The link, team and result of a Submission, the part the record and edit
 * forms share. The team is a set of ticked members; the server holds the
 * rest of the rules (a member with a profile, at least one, at most twenty).
 */
function SubmissionFields({
  idPrefix,
  members,
  url,
  setUrl,
  team,
  setTeam,
  result,
  setResult,
  errors,
}: {
  idPrefix: string;
  members: TeamMember[];
  url: string;
  setUrl: (value: string) => void;
  team: Set<string>;
  setTeam: (value: Set<string>) => void;
  result: string;
  setResult: (value: string) => void;
  errors: Record<string, string>;
}) {
  return (
    <>
      <Field
        label="Submission link"
        htmlFor={`${idPrefix}-url`}
        description="The web address (https) of the entry, such as its Devpost page."
        required
        error={errors.url}
      >
        <Input
          id={`${idPrefix}-url`}
          type="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          maxLength={4096}
        />
      </Field>
      <fieldset className="prj-stack prj-fieldset">
        <legend className="label">Team</legend>
        {members.length === 0 ? (
          <p className="prj-meta">
            No owners or contributors to choose from yet.
          </p>
        ) : (
          <ul className="prj-prs">
            {members.map((member) => (
              <li key={member.userId} className="prj-pr">
                <Checkbox
                  checked={team.has(member.userId)}
                  onChange={(event) => {
                    const on = event.currentTarget.checked;
                    const next = new Set(team);
                    if (on) next.add(member.userId);
                    else next.delete(member.userId);
                    setTeam(next);
                  }}
                  label={memberName(member)}
                />
              </li>
            ))}
          </ul>
        )}
        {errors.team && (
          <p className="prj-status bad" role="alert">
            {errors.team}
          </p>
        )}
        <p className="prj-meta">
          The project&rsquo;s owners and contributors. Tick at least one.
        </p>
      </fieldset>
      <Field
        label="Result"
        htmlFor={`${idPrefix}-result`}
        description="Optional: a placing or prize, such as “Best use of Supabase”."
        error={errors.result}
      >
        <Textarea
          id={`${idPrefix}-result`}
          value={result}
          onChange={(event) => setResult(event.target.value)}
          maxLength={RESULT_MAX}
          rows={2}
        />
      </Field>
    </>
  );
}

const fieldErrorsOf = (
  outcome: { ok: boolean; fieldErrors?: Record<string, string> } | null,
) => (outcome && !outcome.ok ? (outcome.fieldErrors ?? {}) : {});

/**
 * Record a Submission: an approved Hackathon, the link, the team and an
 * optional result. A refusal appears under the field it is about, or beside
 * the button when it is about the whole entry.
 */
export function RecordSubmissionForm({
  projectId,
  hackathons,
  members,
}: {
  projectId: string;
  hackathons: HackathonChoice[];
  members: TeamMember[];
}) {
  const [hackathonId, setHackathonId] = useState(hackathons[0]?.id ?? "");
  const [url, setUrl] = useState("");
  const [team, setTeam] = useState(new Set<string>());
  const [result, setResult] = useState("");
  const command = useCommand(
    async (...args: Parameters<typeof recordSubmission>) => {
      const outcome = await recordSubmission(...args);
      if (outcome.ok) {
        setUrl("");
        setTeam(new Set());
        setResult("");
      }
      return outcome;
    },
  );
  const errors = fieldErrorsOf(command.result);

  if (hackathons.length === 0)
    return (
      <p className="prj-meta">
        No approved hackathons to record against yet.{" "}
        <TextLink href="/dashboard/hackathons">
          Add one on the hackathons page.
        </TextLink>
      </p>
    );

  return (
    <form
      className="prj-form"
      onSubmit={(event) => {
        event.preventDefault();
        command.run(
          projectId,
          hackathonId,
          url,
          [...team],
          result.trim() === "" ? null : result,
        );
      }}
    >
      <Field label="Hackathon" required>
        <Select value={hackathonId} onValueChange={setHackathonId}>
          <SelectTrigger aria-label="Hackathon">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {hackathons.map((hackathon) => (
              <SelectItem key={hackathon.id} value={hackathon.id}>
                {hackathon.name}
                {hackathon.when ? ` · ${hackathon.when}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <SubmissionFields
        idPrefix="prj-sub"
        members={members}
        url={url}
        setUrl={setUrl}
        team={team}
        setTeam={setTeam}
        result={result}
        setResult={setResult}
        errors={errors}
      />
      <div>
        <Button type="submit" size="sm" disabled={command.pending}>
          Record submission
        </Button>
      </div>
      {Object.keys(errors).length === 0 && (
        <CommandFeedback result={command.result} />
      )}
    </form>
  );
}

/**
 * An owner's controls on one recorded Submission: Edit opens its form in
 * place, Delete asks first. The hackathon is fixed; an entry to a different
 * event is a different Submission.
 */
export function SubmissionControls({
  submission,
  members,
}: {
  submission: RecordedSubmission;
  members: TeamMember[];
}) {
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState(submission.url);
  const [team, setTeam] = useState(new Set(submission.teamUserIds));
  const [result, setResult] = useState(submission.result ?? "");
  const command = useCommand(
    async (...args: Parameters<typeof updateSubmission>) => {
      const outcome = await updateSubmission(...args);
      if (outcome.ok) setEditing(false);
      return outcome;
    },
  );
  const errors = fieldErrorsOf(command.result);
  // A member who left the candidates (an erased account has no name, and a
  // contributor's repo may have been unlinked) still shows ticked.
  const known = new Set(members.map((member) => member.userId));
  const choices = [
    ...members,
    ...submission.teamUserIds
      .map((userId, index) => ({
        userId,
        name: submission.team[index] ?? null,
      }))
      .filter((member) => !known.has(member.userId)),
  ];

  return (
    <>
      <div className="prj-acts">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          aria-expanded={editing}
          onClick={() => setEditing((open) => !open)}
        >
          {editing ? "Cancel" : "Edit"}
        </Button>
        <ProjectCommand
          action={deleteSubmission}
          args={[submission.id]}
          label="Delete"
          variant="destructive"
          confirm={{
            title: "Delete this submission?",
            description:
              "The entry and its team are removed from the project. The hackathon stays.",
          }}
        />
      </div>
      {editing && (
        <form
          className="prj-form"
          onSubmit={(event) => {
            event.preventDefault();
            command.run(
              submission.id,
              url,
              [...team],
              result.trim() === "" ? null : result,
            );
          }}
        >
          <SubmissionFields
            idPrefix={`prj-sub-${submission.id}`}
            members={choices}
            url={url}
            setUrl={setUrl}
            team={team}
            setTeam={setTeam}
            result={result}
            setResult={setResult}
            errors={errors}
          />
          <div>
            <Button type="submit" size="sm" disabled={command.pending}>
              Save submission
            </Button>
          </div>
          {Object.keys(errors).length === 0 && (
            <CommandFeedback result={command.result} />
          )}
        </form>
      )}
    </>
  );
}
