"use client";

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
  type ReactNode,
  type SubmitEvent,
} from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "~/ui/alert-dialog";
import FormButton from "~/components/FormButton";

interface Props extends PropsWithChildren {
  title: string;
  description: ReactNode;
  action: (formData: FormData) => Promise<void> | void;
  submitLabel: string;
  userConfirmText?: string;
}

export default function ConfirmDestructiveAction({
  title,
  description,
  action,
  submitLabel,
  userConfirmText,
  children,
}: Props) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const confirmed = useRef(false);

  const disableConfirmButton = useMemo(
    () => userConfirmText !== undefined && userConfirmText !== typed,
    [userConfirmText, typed],
  );

  const handleSubmit = useCallback((e: SubmitEvent<HTMLFormElement>) => {
    if (confirmed.current) {
      confirmed.current = false;
      return;
    }
    e.preventDefault();
    setOpen(true);
    setTyped("");
  }, []);

  const handleConfirm = useCallback(() => {
    if (formRef.current && !disableConfirmButton) {
      confirmed.current = true;
      formRef.current.requestSubmit();
    }
  }, [disableConfirmButton]);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <form
        className="contents"
        action={action}
        onSubmit={handleSubmit}
        ref={formRef}
      >
        {children}
      </form>

      <AlertDialogContent>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>

        {userConfirmText !== undefined && (
          <label className="flex flex-col gap-1.5 text-sm">
            <span>
              Type{" "}
              <span className="rounded-sm bg-white/10 px-1 py-0.5 font-mono text-rose-300">
                {userConfirmText}
              </span>{" "}
              to confirm.
            </span>
            <input
              className="rounded-sm border border-mauve-600 bg-mauve-800 px-3 py-1.5 font-mono text-white transition-colors outline-none focus:border-white"
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
            />
          </label>
        )}

        <div className="flex items-center justify-end gap-4">
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction asChild>
            <FormButton
              theme="rose"
              className="text-sm"
              disabled={disableConfirmButton}
              onClick={handleConfirm}
              type="button"
            >
              {submitLabel}
            </FormButton>
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
