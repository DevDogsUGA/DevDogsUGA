"use client";

import Link from "next/link";
import { useState } from "react";
import HandlePicker from "~/classic/components/HandlePicker";
import { describeHandleOutcome } from "~/lib/handleOptions";
import { profilePath } from "~/lib/profilePath";
import {
  PUBLIC_PROFILE_FIELD_OPTIONS,
  PUBLIC_PROFILE_FIELDS,
  type PublicProfileSwitches,
} from "~/lib/publicProfileFields";
import setHandle from "~/server/actions/profileHandle";
import {
  getMyHandleChoices,
  setPublicProfileField,
  updateAccountVisibility,
  type AccountVisibilityInput,
  type PublicProfileSettings,
} from "~/server/actions/publicProfile";
import { ExpectedFailure } from "~/lib/actionResult";
import type { HandleChoices } from "~/server/loaders/publicProfiles";
import Callout from "~/classic/ui/callout";
import Field from "~/classic/ui/field";
import { FieldError, useSettingsField } from "~/classic/ui/settings-form";
import VisibilityToggle from "~/classic/ui/visibility-toggle";

type Provider = "github" | "discord" | "linkedin";

/**
 * The per-field switches the baseline page had. "Contributions" is a later
 * addition that the restored public profile does not render, so its switch
 * stays out of the page; its stored value is untouched.
 */
const SHOWN_FIELD_OPTIONS = PUBLIC_PROFILE_FIELD_OPTIONS.filter(
  (option) => option.field !== "showContributions",
);

/** The `platform.profile` switch behind each connected account's row. */
const SHOW_COLUMN = {
  github: "showGithub",
  discord: "showDiscord",
  linkedin: "showLinkedin",
} as const satisfies Record<Provider, keyof AccountVisibilityInput>;

/** One connected account's row of the "on your profile" group. */
export interface AccountSwitch {
  provider: Provider;
  label: string;
  /** The linked account's name, or null when none is linked. */
  name: string | null;
  show: boolean;
}

/**
 * The profile settings for the public page: the master switch, one switch per
 * part of the profile, the connected accounts to show and the handle. All of it
 * waits for the page's Save, as one field: it changes a draft here and
 * `save` writes whatever differs from what the server last confirmed.
 *
 * Whether the member is actually listed is the server's call (the
 * `publicProfiles` view); `live` below only mirrors its conditions to decide
 * whether a link to the page would work.
 */
export default function PublicProfileSection({
  settings,
  accounts,
}: {
  settings: PublicProfileSettings;
  accounts: AccountSwitch[];
}) {
  const [saved, setSaved] = useState({
    switches: settings.switches,
    accounts: Object.fromEntries(
      accounts.map((a) => [a.provider, a.show]),
    ) as Record<Provider, boolean>,
    handle: settings.current,
  });
  const [switches, setSwitches] = useState<PublicProfileSwitches>(
    settings.switches,
  );
  const [shown, setShown] = useState<Record<Provider, boolean>>(saved.accounts);
  const [handle, setHandleDraft] = useState<string | null>(settings.current);
  const [choices, setChoices] = useState<HandleChoices>(settings);

  const switchesDirty = PUBLIC_PROFILE_FIELDS.some(
    (f) => switches[f] !== saved.switches[f],
  );
  const accountsDirty = accounts.some(
    (a) => shown[a.provider] !== saved.accounts[a.provider],
  );
  const handleDirty = handle !== null && handle !== saved.handle;
  const isDirty = switchesDirty || accountsDirty || handleDirty;

  const { serverError } = useSettingsField({
    id: "publicProfile",
    label: "Public profile",
    draft: [switches, shown, handle],
    isDirty,
    error: null,
    reset: () => {
      setSwitches(saved.switches);
      setShown(saved.accounts);
      setHandleDraft(saved.handle);
    },
    save: async () => {
      // Each write is its own call, so a failure part way leaves the earlier
      // ones landed: `saved` follows what the server accepted, and the draft
      // keeps the rest dirty for the retry.
      let next = saved;
      try {
        for (const field of PUBLIC_PROFILE_FIELDS) {
          if (switches[field] === next.switches[field]) continue;
          const outcome = await setPublicProfileField(field, switches[field]);
          if (outcome.status === "blocked") {
            throw new Error("Your profile is locked, so it cannot be changed.");
          }
          if (outcome.status === "rate_limited") {
            throw new Error(
              "Too many changes. Wait a few minutes and try again.",
            );
          }
          next = {
            ...next,
            switches: { ...next.switches, [field]: switches[field] },
          };
        }

        const changedAccounts = accounts.filter(
          ({ provider }) => shown[provider] !== next.accounts[provider],
        );
        if (changedAccounts.length > 0) {
          const result = await updateAccountVisibility(
            Object.fromEntries(
              changedAccounts.map(({ provider }) => [
                SHOW_COLUMN[provider],
                shown[provider],
              ]),
            ),
          );
          if (!result.ok)
            throw new ExpectedFailure(result.message, result.fieldErrors);
          next = {
            ...next,
            accounts: {
              ...next.accounts,
              ...Object.fromEntries(
                changedAccounts.map(({ provider }) => [
                  provider,
                  shown[provider],
                ]),
              ),
            },
          };
        }

        if (handle !== null && handle !== next.handle) {
          const outcome = describeHandleOutcome(await setHandle(handle));
          if (outcome.tone !== "success") {
            if (outcome.refresh) {
              const fresh = await getMyHandleChoices().catch(() => null);
              if (fresh) {
                setChoices(fresh);
                setHandleDraft(fresh.current);
              }
            }
            throw new Error(outcome.message);
          }
          next = { ...next, handle };
          setChoices((c) => ({ ...c, current: handle }));
        }
      } finally {
        setSaved(next);
      }
    },
  });

  const live = settings.isVerified && switches.publicProfile && handle !== null;
  const currentHandle = saved.handle;

  return (
    <>
      {!settings.isVerified && (
        <Callout tone="info">
          These settings take effect once your profile is verified. Unverified
          accounts are never listed, whatever is set here.
        </Callout>
      )}

      <Field
        id="publicProfile"
        label="Display my profile publicly"
        description="Lists you in the community directory and gives you a page at your handle. Turn it off and you are removed from both."
      >
        <VisibilityToggle
          checked={switches.publicProfile}
          pending={false}
          onToggle={() =>
            setSwitches((s) => ({ ...s, publicProfile: !s.publicProfile }))
          }
          label="Public profile"
        />
        {live && currentHandle && (
          <Link
            href={profilePath(currentHandle)}
            className="w-fit text-sm text-cyan-300 underline hover:text-white"
          >
            View your public profile ({profilePath(currentHandle)})
          </Link>
        )}
      </Field>

      <Field
        id="publicFields"
        label="What your profile shows"
        description="Choose which parts appear on your public page. Your majors and graduation year are always shown; your email, graduation semester, minors and certificates never are."
      >
        <div className="flex flex-col gap-3">
          {SHOWN_FIELD_OPTIONS.map(({ field, label, description }) => (
            <div key={field} className="flex flex-col gap-1">
              <VisibilityToggle
                checked={switches[field]}
                pending={false}
                onToggle={() =>
                  setSwitches((s) => ({ ...s, [field]: !s[field] }))
                }
                label={label}
              />
              <span className="text-xs text-mauve-400">{description}</span>
            </div>
          ))}
        </div>
      </Field>

      <Field
        id="publicAccounts"
        label="Connected accounts on your profile"
        description="Choose which linked accounts appear on your public page."
      >
        <div className="flex flex-col gap-3">
          {accounts.map((account) => (
            <div key={account.provider} className="flex flex-col gap-1">
              <VisibilityToggle
                checked={account.name !== null && shown[account.provider]}
                pending={account.name === null}
                onToggle={() =>
                  setShown((s) => ({
                    ...s,
                    [account.provider]: !s[account.provider],
                  }))
                }
                label={account.label}
              />
              <span className="text-xs text-mauve-400">
                {account.name ? (
                  <>
                    Shows <span className="font-mono">{account.name}</span>.
                  </>
                ) : (
                  <>
                    Not connected.{" "}
                    <Link
                      href="/dashboard/profile#connectedAccounts"
                      className="underline hover:text-white"
                    >
                      Link it under Connected Accounts
                    </Link>{" "}
                    to show it.
                  </>
                )}
              </span>
            </div>
          ))}
        </div>
      </Field>

      <FieldError error={serverError} />

      <Field
        id="handle"
        label="Handle"
        description="The address of your public profile. Changing it breaks links to your old address; you will be warned before you save."
      >
        <HandlePicker
          choices={choices}
          value={handle}
          onValueChange={setHandleDraft}
        />
      </Field>
    </>
  );
}
