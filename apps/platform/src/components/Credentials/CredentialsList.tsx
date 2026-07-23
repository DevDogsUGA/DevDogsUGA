"use client";

import { useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardIcon, TrashIcon } from "@phosphor-icons/react/ssr";
import { ConsoleCard } from "~/ui/card";
import ConfirmDestructiveAction from "~/ui/confirm-destructive-action";
import FormButton from "~/components/FormButton";
import TOTPCode from "./TOTPCode";
import {
  deleteCredential,
  revealPassword,
  type CredentialRow,
} from "~/server/actions/credentials";

interface Props {
  credentials: CredentialRow[];
  canCreate: boolean;
}

function CopyPasswordButton({ credentialId }: { credentialId: string }) {
  const [isPending, startTransition] = useTransition();

  const handleCopy = useCallback(() => {
    startTransition(async () => {
      try {
        const password = await revealPassword(credentialId);
        await navigator.clipboard.writeText(password);
      } catch {
        // silently ignore — clipboard API errors are non-critical
      }
    });
  }, [credentialId]);

  return (
    <button
      onClick={handleCopy}
      disabled={isPending}
      className="flex items-center gap-1.5 rounded-sm border border-mauve-600 bg-mauve-800 px-3 py-1 text-xs font-medium text-white transition-colors outline-none hover:border-white focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1 focus-visible:ring-offset-mauve-950 disabled:cursor-wait disabled:opacity-50"
    >
      <ClipboardIcon className="h-3 w-3" aria-hidden />
      {isPending ? "Copying…" : "Copy password"}
    </button>
  );
}

function CredentialCard({
  credential,
  canCreate,
}: {
  credential: CredentialRow;
  canCreate: boolean;
}) {
  const router = useRouter();

  const deleteAction = useCallback(
    async (_formData: FormData) => {
      await deleteCredential(credential.id);
      router.refresh();
    },
    [credential.id, router],
  );

  return (
    <ConsoleCard.Root id={`credential-${credential.id}`}>
      <ConsoleCard.Header title={credential.name}>
        {credential.description && (
          <p className="mt-1 text-sm text-mauve-400">
            {credential.description}
          </p>
        )}
      </ConsoleCard.Header>

      <ConsoleCard.Content>
        {/* Roles */}
        <div>
          <p className="mb-2 text-xs font-semibold tracking-wider text-mauve-400 uppercase">
            Accessible to
          </p>
          <div className="flex flex-wrap gap-2">
            {credential.roles.map((role) => (
              <span
                key={role.id}
                className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-2.5 py-0.5 text-xs font-medium text-cyan-300"
              >
                {role.title}
              </span>
            ))}
          </div>
        </div>

        {/* Email */}
        {credential.email && (
          <div>
            <p className="mb-1 text-xs font-semibold tracking-wider text-mauve-400 uppercase">
              Email
            </p>
            <span className="font-mono text-sm text-white">
              {credential.email}
            </span>
          </div>
        )}

        {/* Password */}
        {credential.hasPassword && (
          <div>
            <p className="mb-2 text-xs font-semibold tracking-wider text-mauve-400 uppercase">
              Password
            </p>
            <CopyPasswordButton credentialId={credential.id} />
          </div>
        )}

        {/* TOTP */}
        {credential.hasTotp && (
          <div>
            <p className="mb-2 text-xs font-semibold tracking-wider text-mauve-400 uppercase">
              2FA Code
            </p>
            <TOTPCode credentialId={credential.id} />
          </div>
        )}

        {canCreate && (
          <div className="flex justify-end">
            <ConfirmDestructiveAction
              title="Delete credential set"
              description={
                <>
                  This will permanently delete{" "}
                  <strong>{credential.name}</strong> and remove all stored
                  secrets from the vault. This cannot be undone.
                </>
              }
              action={deleteAction}
              submitLabel="Delete"
              userConfirmText={credential.name}
            >
              <FormButton
                theme="rose"
                type="submit"
                className="flex items-center gap-1.5 text-sm"
              >
                <TrashIcon className="h-3.5 w-3.5" aria-hidden />
                Delete
              </FormButton>
            </ConfirmDestructiveAction>
          </div>
        )}
      </ConsoleCard.Content>
    </ConsoleCard.Root>
  );
}

export default function CredentialsList({ credentials, canCreate }: Props) {
  if (credentials.length === 0) {
    return (
      <div className="w-full rounded-xl border-2 border-dashed border-mauve-700 bg-white/5 px-6 py-12 text-center">
        <p className="text-mauve-400">
          {canCreate
            ? "No credentials yet. Create one above."
            : "No credentials are available to your role."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {credentials.map((credential) => (
        <CredentialCard
          key={credential.id}
          credential={credential}
          canCreate={canCreate}
        />
      ))}
    </div>
  );
}
