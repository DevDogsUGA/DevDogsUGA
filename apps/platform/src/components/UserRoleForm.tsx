"use client";

import { updateUserRole } from "~/server/actions/moderation";
import FormButton from "~/components/FormButton";
import Field from "~/ui/field";
import { Input } from "~/ui/input";
import { CommandFeedback, useCommand } from "~/ui/use-command";

export default function UserRoleForm({
  targetUserId,
  currentRole,
}: {
  targetUserId: string;
  currentRole: "member" | "suspended" | "banned";
}) {
  const { run, pending: isPending, result } = useCommand(updateUserRole);

  function handleSubmit(formData: FormData) {
    const role = formData.get("role") as "member" | "suspended" | "banned";
    const reason = (formData.get("reason") as string) || undefined;
    run(targetUserId, role, reason);
  }

  return (
    <form action={handleSubmit} className="con-stack">
      <div className="con-fields">
        <Field label="Role" htmlFor="user-role">
          <span className="input select">
            <select id="user-role" name="role" defaultValue={currentRole}>
              <option value="member">Member</option>
              <option value="suspended">Suspended</option>
              <option value="banned">Banned</option>
            </select>
          </span>
        </Field>

        <Field
          label="Reason (optional)"
          htmlFor="user-role-reason"
          description="Shown to client apps."
        >
          <Input
            id="user-role-reason"
            name="reason"
            type="text"
            placeholder="e.g. Repeated harassment"
          />
        </Field>
      </div>

      <FormButton
        type="submit"
        disabled={isPending}
        theme="black"
        className="w-fit"
      >
        Update role
      </FormButton>
      <CommandFeedback result={result} />
    </form>
  );
}
