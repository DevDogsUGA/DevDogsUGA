"use client";

import {
  addTestAccount,
  updateTestAccount,
  type TestAccount,
} from "~/server/actions/testAccounts";
import FormButton from "./FormButton";
import Input from "~/components/Input";
import { Button } from "~/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/ui/dialog";
import { CommandFeedback, useCommand } from "~/ui/use-command";

interface TestAccountDialogProps {
  account?: TestAccount;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (account: TestAccount) => void;
}

/**
 * Adds a test account, or renames the one passed in. The form is its own
 * component so each opening starts with no stale refusal, and a refusal (the
 * five-account cap, an unknown account) shows in the dialog it came from.
 */
export default function TestAccountDialog({
  account,
  open,
  onOpenChange,
  onSuccess,
}: TestAccountDialogProps) {
  const isEdit = account !== undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit test account" : "Add test account"}
          </DialogTitle>
          <DialogDescription>
            A sandboxed identity you can sign in as while testing your OAuth
            client.
          </DialogDescription>
        </DialogHeader>
        <TestAccountForm
          account={account}
          onDone={(saved) => {
            onSuccess(saved);
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function TestAccountForm({
  account,
  onDone,
}: {
  account?: TestAccount;
  onDone: (account: TestAccount) => void;
}) {
  const isEdit = account !== undefined;
  const { run, pending, result } = useCommand(async (formData: FormData) => {
    const outcome = isEdit
      ? await updateTestAccount(formData)
      : await addTestAccount(formData);
    if (outcome.ok && outcome.data) {
      onDone({
        userId: outcome.data.testUserId,
        displayName: outcome.data.displayName,
        createdAt: account?.createdAt ?? new Date().toISOString(),
      });
    }
    return outcome;
  });

  return (
    <form action={run} className="grid gap-4">
      {isEdit && (
        <input type="hidden" name="testUserId" value={account.userId} />
      )}

      <label className="field">
        <span className="label">Display name</span>
        <Input
          name="displayName"
          type="text"
          defaultValue={account?.displayName}
          placeholder="Jane Doe"
          maxLength={255}
          required
          autoFocus
        />
      </label>

      <CommandFeedback result={result} />

      <DialogFooter>
        <DialogClose asChild>
          <Button variant="ghost" type="button" disabled={pending}>
            Cancel
          </Button>
        </DialogClose>
        <FormButton theme="cyan" type="submit" disabled={pending}>
          {isEdit ? "Save" : "Add"}
        </FormButton>
      </DialogFooter>
    </form>
  );
}
