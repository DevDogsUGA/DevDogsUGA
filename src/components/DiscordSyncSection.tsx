"use client";

import { useRouter } from "next/navigation";
import { GameControllerIcon } from "@phosphor-icons/react/ssr";
import ConfirmDestructiveAction from "~/ui/confirm-destructive-action";
import FormButton from "~/components/FormButton";
import type { RoleRow } from "~/hooks/useRoles";
import { unsyncRole } from "~/server/actions/discordRoleSync";
import type { DiscordSyncCapability } from "~/lib/discordCapability";
import LinkDiscordRoleDialog from "./LinkDiscordRoleDialog";

interface Props {
  role: RoleRow;
  callerCapability: DiscordSyncCapability;
}

export default function DiscordSyncSection({ role, callerCapability }: Props) {
  const router = useRouter();

  async function handleUnsync() {
    await unsyncRole(role.id);
    router.refresh();
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-xs font-medium text-white/70">
        Discord Sync
      </legend>
      {role.discordRoleId === null ? (
        <LinkDiscordRoleDialog
          role={role}
          callerCapability={callerCapability}
        />
      ) : (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/80">
          <span className="flex min-w-0 items-center gap-1.5">
            <GameControllerIcon
              className="h-3.5 w-3.5 shrink-0 text-indigo-300"
              aria-hidden
            />
            <span className="truncate">
              Synced with Discord role &ldquo;{role.discordSyncedName}&rdquo;
            </span>
          </span>
          <ConfirmDestructiveAction
            title="Unsync from Discord"
            description={
              <>
                This removes the Discord link from <strong>{role.title}</strong>
                . Name and color will no longer sync, and members won&apos;t
                need a linked Discord account to be assigned this role. The
                Discord role and its members are unaffected.
              </>
            }
            action={handleUnsync}
            submitLabel="Unsync"
          >
            <FormButton theme="rose" type="submit" className="text-xs">
              Unsync
            </FormButton>
          </ConfirmDestructiveAction>
        </div>
      )}
    </fieldset>
  );
}
