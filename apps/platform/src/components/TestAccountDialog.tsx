"use client";

import { useMutation } from "@tanstack/react-query";
import { useCallback } from "react";
import { XIcon } from "@phosphor-icons/react/ssr";
import {
  addTestAccount,
  updateTestAccount,
  type TestAccount,
} from "~/server/actions/testAccounts";
import FormButton from "./FormButton";
import { toast } from "~/lib/toast";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/ui/dialog";

interface TestAccountDialogProps {
  account?: TestAccount;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (account: TestAccount) => void;
}

export default function TestAccountDialog({
  account,
  open,
  onOpenChange,
  onSuccess,
}: TestAccountDialogProps) {
  const isEdit = account !== undefined;

  const mutation = useMutation({
    mutationFn: async (formData: FormData): Promise<TestAccount> => {
      if (isEdit) {
        await updateTestAccount(undefined, formData);
        return {
          ...account,
          displayName: formData.get("displayName") as string,
        };
      }
      const { testUserId, displayName } = await addTestAccount(formData);
      return {
        userId: testUserId,
        displayName,
        createdAt: new Date().toISOString(),
      };
    },
    onSuccess: (result) => {
      toast.success(isEdit ? "Test account updated" : "Test account added");
      onSuccess(result);
      onOpenChange(false);
    },
    onError: (err) =>
      toast.error(
        err instanceof Error ? err.message : "Failed to save test account",
      ),
  });

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      mutation.mutate(new FormData(e.currentTarget));
    },
    [mutation],
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !mutation.isPending && onOpenChange(o)}
    >
      <DialogContent
        className="max-w-md border-mauve-700 bg-mauve-900 text-mauve-300 shadow-xl shadow-black/40"
        onInteractOutside={(e) => mutation.isPending && e.preventDefault()}
        onEscapeKeyDown={(e) => mutation.isPending && e.preventDefault()}
        showCloseButton={false}
      >
        <DialogHeader className="flex-row items-center justify-between">
          <DialogTitle className="text-lg font-semibold text-white">
            {isEdit ? "Edit Test Account" : "Add Test Account"}
          </DialogTitle>
          <DialogClose
            className="rounded-sm p-1 text-mauve-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled={mutation.isPending}
            aria-label="Close"
          >
            <XIcon />
          </DialogClose>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {isEdit && (
            <input type="hidden" name="authUserId" value={account.userId} />
          )}

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-white">
              Display Name
            </span>
            <input
              className="rounded-sm border border-mauve-600 bg-mauve-800 px-3 py-2 text-sm text-white transition-colors outline-none focus:border-white"
              name="displayName"
              type="text"
              defaultValue={account?.displayName}
              placeholder="Jane Doe"
              maxLength={255}
              required
              autoFocus
            />
          </label>

          <div className="flex justify-end gap-2 pt-1">
            <DialogClose
              className="rounded-sm border border-mauve-600 bg-mauve-800 px-4 py-1.5 text-sm text-white transition-colors hover:border-white disabled:cursor-not-allowed disabled:opacity-50"
              disabled={mutation.isPending}
            >
              Cancel
            </DialogClose>
            <FormButton
              theme="black"
              type="submit"
              className="text-sm"
              disabled={mutation.isPending}
            >
              {isEdit ? "Save" : "Add"}
            </FormButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
