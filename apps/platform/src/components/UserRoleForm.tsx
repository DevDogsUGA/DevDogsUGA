"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { updateUserRole } from "~/server/actions/moderation";
import FormButton from "~/components/FormButton";

export default function UserRoleForm({
  targetUserId,
  currentRole,
}: {
  targetUserId: string;
  currentRole: "member" | "suspended" | "banned";
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    const role = formData.get("role") as "member" | "suspended" | "banned";
    const reason = (formData.get("reason") as string) || undefined;

    startTransition(async () => {
      await updateUserRole(targetUserId, role, reason);
      router.refresh();
    });
  }

  // Both controls, one string: this form only ever renders on the console's
  // dark ground, where the light control it used to be was white text on a
  // white field.
  const controlClass =
    "rounded-sm border border-mauve-600 bg-mauve-800 px-2 py-1.5 text-sm text-white outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1 focus-visible:ring-offset-mauve-950";

  return (
    <form action={handleSubmit} className="flex flex-col gap-3">
      <div className="flex gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-mauve-400">Role</span>
          <select
            name="role"
            className={controlClass}
            defaultValue={currentRole}
          >
            <option value="member">Member</option>
            <option value="suspended">Suspended</option>
            <option value="banned">Banned</option>
          </select>
        </label>

        <label className="flex flex-1 flex-col gap-1">
          <span className="text-xs text-mauve-400">
            Reason (optional, shown to client apps)
          </span>
          <input
            name="reason"
            type="text"
            className={`${controlClass} placeholder:text-mauve-500`}
            placeholder="e.g. Repeated harassment"
          />
        </label>
      </div>

      <FormButton
        type="submit"
        disabled={isPending}
        theme="black"
        className="self-start text-sm"
      >
        Update Role
      </FormButton>
    </form>
  );
}
