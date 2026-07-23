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

  const selectClass =
    "rounded-sm border border-black bg-white px-2 py-1.5 text-sm text-mauve-950 focus:outline-none focus:ring-1 focus:ring-black";

  return (
    <form action={handleSubmit} className="flex flex-col gap-3">
      <div className="flex gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-mauve-500">Role</span>
          <select
            name="role"
            className={selectClass}
            defaultValue={currentRole}
          >
            <option value="member">Member</option>
            <option value="suspended">Suspended</option>
            <option value="banned">Banned</option>
          </select>
        </label>

        <label className="flex flex-1 flex-col gap-1">
          <span className="text-xs text-mauve-500">
            Reason (optional, shown to client apps)
          </span>
          <input
            name="reason"
            type="text"
            className="rounded-sm border border-black bg-white px-2 py-1.5 text-sm focus:ring-1 focus:ring-black focus:outline-none"
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
