"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState, useTransition } from "react";
import { PlusIcon, XIcon } from "@phosphor-icons/react/ssr";
import FormButton from "~/components/FormButton";
import {
  createCredential,
  type CredentialType,
} from "~/server/actions/credentials";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/ui/dialog";

interface Props {
  allRoles: Array<{ id: string; title: string }>;
}

export default function CreateCredentialDialog({ allRoles }: Props) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const nameRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const totpRef = useRef<HTMLInputElement>(null);

  const [type, setType] = useState<CredentialType>("email_password");
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(new Set());

  const hasEmail = type !== "totp";
  const hasPassword = type !== "totp";
  const hasTotp = type !== "email_password";

  const toggleRole = useCallback((role: string) => {
    setSelectedRoles((prev) => {
      const next = new Set(prev);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      return next;
    });
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      const name = nameRef.current?.value.trim() ?? "";
      const description = descriptionRef.current?.value.trim();
      const email = emailRef.current?.value.trim();
      const password = passwordRef.current?.value;
      const totpSecret = totpRef.current?.value.trim();
      const roleIds = [...selectedRoles];

      if (!name) {
        setError("Name is required.");
        return;
      }
      if (roleIds.length === 0) {
        setError("Select at least one role.");
        return;
      }
      if (hasPassword && !password) {
        setError("Password is required.");
        return;
      }
      if (hasTotp && !totpSecret) {
        setError("TOTP secret is required.");
        return;
      }

      startTransition(async () => {
        try {
          await createCredential({
            name,
            description: description || undefined,
            type,
            email: email || undefined,
            password: password || undefined,
            totpSecret: totpSecret || undefined,
            roleIds,
          });
          setOpen(false);
          setSelectedRoles(new Set());
          setType("email_password");
          router.refresh();
        } catch (err) {
          setError(
            err instanceof Error ? err.message : "Something went wrong.",
          );
        }
      });
    },
    [type, selectedRoles, hasPassword, hasTotp, router],
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="flex items-center gap-2 rounded-sm border-2 border-white bg-white px-4 py-1.5 text-sm font-medium text-black transition outline-none hover:bg-transparent hover:text-white focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-mauve-900">
          <PlusIcon aria-hidden />
          New Credential
        </button>
      </DialogTrigger>

      <DialogContent
        className="max-w-lg border-mauve-700 bg-mauve-900 p-0 shadow-xl shadow-black/40"
        showCloseButton={false}
      >
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-5 px-5 py-6"
        >
          <DialogHeader className="flex-row items-center justify-between">
            <DialogTitle className="text-lg font-semibold text-white">
              New Credential Set
            </DialogTitle>
            <DialogClose className="rounded-sm p-1 text-mauve-400 transition outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-white">
              <XIcon aria-hidden />
            </DialogClose>
          </DialogHeader>

            {/* Name */}
            <label className="flex flex-col gap-1 text-sm font-medium text-white">
              Name *
              <input
                ref={nameRef}
                type="text"
                required
                placeholder="e.g. Figma Org Account"
                className="rounded-sm border border-mauve-600 bg-mauve-800 px-3 py-1.5 font-normal text-white transition-colors outline-none placeholder:text-mauve-500 focus:border-white"
              />
            </label>

            {/* Description */}
            <label className="flex flex-col gap-1 text-sm font-medium text-white">
              Description
              <textarea
                ref={descriptionRef}
                rows={2}
                placeholder="Optional — describe what this account is used for"
                className="resize-none rounded-sm border border-mauve-600 bg-mauve-800 px-3 py-1.5 font-normal text-white transition-colors outline-none placeholder:text-mauve-500 focus:border-white"
              />
            </label>

            {/* Type */}
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium text-white">Type *</legend>
              <div className="flex flex-wrap gap-3">
                {(
                  [
                    ["email_password", "Email / Password"],
                    ["email_password_totp", "Email / Password + 2FA"],
                    ["totp", "2FA only"],
                  ] as [CredentialType, string][]
                ).map(([value, label]) => (
                  <label
                    key={value}
                    className="flex cursor-pointer items-center gap-1.5 text-sm text-mauve-200"
                  >
                    <input
                      type="radio"
                      name="type"
                      value={value}
                      checked={type === value}
                      onChange={() => setType(value)}
                      className="accent-cyan-400"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>

            {/* Email */}
            {hasEmail && (
              <label className="flex flex-col gap-1 text-sm font-medium text-white">
                Email
                <input
                  ref={emailRef}
                  type="email"
                  placeholder="shared@example.com"
                  className="rounded-sm border border-mauve-600 bg-mauve-800 px-3 py-1.5 font-normal text-white transition-colors outline-none placeholder:text-mauve-500 focus:border-white"
                />
              </label>
            )}

            {/* Password */}
            {hasPassword && (
              <label className="flex flex-col gap-1 text-sm font-medium text-white">
                Password *
                <input
                  ref={passwordRef}
                  type="password"
                  autoComplete="new-password"
                  required={hasPassword}
                  className="rounded-sm border border-mauve-600 bg-mauve-800 px-3 py-1.5 font-mono font-normal text-white transition-colors outline-none placeholder:text-mauve-500 focus:border-white"
                />
              </label>
            )}

            {/* TOTP secret */}
            {hasTotp && (
              <label className="flex flex-col gap-1 text-sm font-medium text-white">
                TOTP Secret (Base32) *
                <input
                  ref={totpRef}
                  type="text"
                  required={hasTotp}
                  placeholder="JBSWY3DPEHPK3PXP…"
                  spellCheck={false}
                  autoComplete="off"
                  className="rounded-sm border border-mauve-600 bg-mauve-800 px-3 py-1.5 font-mono font-normal tracking-wider text-white transition-colors outline-none placeholder:text-mauve-500 focus:border-white"
                />
                <span className="text-xs font-normal text-mauve-400">
                  The Base32 secret shown by the service when enabling 2FA.
                </span>
              </label>
            )}

            {/* Roles */}
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium text-white">
                Visible to roles *
              </legend>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {allRoles.map((role) => (
                  <label
                    key={role.id}
                    className="flex cursor-pointer items-center gap-1.5 text-sm text-mauve-200"
                  >
                    <input
                      type="checkbox"
                      checked={selectedRoles.has(role.id)}
                      onChange={() => toggleRole(role.id)}
                      className="accent-cyan-400"
                    />
                    {role.title}
                  </label>
                ))}
              </div>
            </fieldset>

            {error && <p className="text-sm text-rose-400">{error}</p>}

            <div className="flex justify-end gap-3 pt-1">
              <DialogClose asChild>
                <button
                  type="button"
                  className="rounded-sm border border-mauve-600 bg-mauve-800 px-4 py-1.5 text-sm font-medium text-white transition-colors outline-none hover:border-white focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-mauve-900"
                >
                  Cancel
                </button>
              </DialogClose>
              <FormButton theme="black" type="submit" disabled={isPending}>
                Create
              </FormButton>
            </div>
          </form>
        </DialogContent>
      </Dialog>
  );
}
