"use client";

import Link from "next/link";
import { useState } from "react";
import HandlePicker from "~/components/HandlePicker";
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
  revalidateMyPublicProfile,
  setPublicProfileField,
  type PublicProfileSettings,
} from "~/server/actions/publicProfile";
import { createClient } from "~/supabase/client";
import type { HandleChoices } from "~/server/loaders/publicProfiles";
import Callout from "~/ui/callout";
import { useSettingsField } from "~/ui/settings-form";
import Toggle from "~/ui/switch";

type Provider = "github" | "discord" | "linkedin";

/** One connected account's row of the "on your profile" group. */
export interface AccountSwitch {
  provider: Provider;
  label: string;
  /** The linked account's name, or null when none is linked. */
  name: string | null;
  show: boolean;
}

function Row({
  label,
  checked,
  disabled,
  onToggle,
  children,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  // A real switch that only flips draft state: a click is not a form submit.
  return (
    <div className="set-sw">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onToggle();
        }}
        className="contents"
      >
        <Toggle
          checked={checked}
          pending={false}
          disabled={disabled}
          aria-label={label}
        />
      </form>
      <div>
        <b>{label}</b>
        <div className="help">{children}</div>
      </div>
    </div>
  );
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
  userId,
}: {
  settings: PublicProfileSettings;
  accounts: AccountSwitch[];
  userId: string;
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

  useSettingsField({
    id: "publicProfile",
    label: "Public profile",
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

        for (const account of accounts) {
          const provider = account.provider;
          if (shown[provider] === next.accounts[provider]) continue;
          const column =
            provider === "github"
              ? { showGithub: shown[provider] }
              : provider === "discord"
                ? { showDiscord: shown[provider] }
                : { showLinkedin: shown[provider] };
          const { error } = await createClient()
            .from("profile")
            .update(column)
            .eq("userId", userId);
          if (error) throw error;
          next = {
            ...next,
            accounts: { ...next.accounts, [provider]: shown[provider] },
          };
        }
        if (next.accounts !== saved.accounts) {
          await revalidateMyPublicProfile().catch(() => undefined);
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

      <div className="set-rows">
        <Row
          label="Display my profile publicly"
          checked={switches.publicProfile}
          onToggle={() =>
            setSwitches((s) => ({ ...s, publicProfile: !s.publicProfile }))
          }
        >
          Needs a verified account.
          {live && currentHandle && (
            <>
              {" "}
              <Link href={profilePath(currentHandle)} className="textlink">
                View your public profile ({profilePath(currentHandle)})
              </Link>
            </>
          )}
        </Row>

        <div className="set-sub label" id="publicFields">
          What your profile shows
        </div>
        {PUBLIC_PROFILE_FIELD_OPTIONS.map(({ field, label, description }) => (
          <Row
            key={field}
            label={label}
            checked={switches[field]}
            onToggle={() => setSwitches((s) => ({ ...s, [field]: !s[field] }))}
          >
            {description}
          </Row>
        ))}

        <div className="set-sub label" id="publicAccounts">
          Connected accounts on your profile
        </div>
        {accounts.map((account) => (
          <Row
            key={account.provider}
            label={account.label}
            checked={account.name !== null && shown[account.provider]}
            disabled={account.name === null}
            onToggle={() =>
              setShown((s) => ({
                ...s,
                [account.provider]: !s[account.provider],
              }))
            }
          >
            {account.name ? (
              <>
                Shows <span className="mono">{account.name}</span>.
              </>
            ) : (
              <>
                Not connected.{" "}
                <Link href="/settings/accounts" className="textlink">
                  Link it in Connected accounts
                </Link>{" "}
                to show it.
              </>
            )}
          </Row>
        ))}
        <p className="help" style={{ marginTop: 20 }}>
          Always shown on a public profile: your majors and graduation year.
          Never shown: your email, graduation semester, minors and certificates.
        </p>
      </div>

      <div id="handle" className="scroll-mt-20" style={{ marginTop: 36 }}>
        <div className="label" style={{ marginBottom: 6 }}>
          Handle
        </div>
        <p className="help" style={{ margin: "0 0 12px", maxWidth: "62ch" }}>
          The address of your public profile. Changing it breaks links to your
          old address; you will be warned before you save.
        </p>
        <HandlePicker
          choices={choices}
          value={handle}
          onValueChange={setHandleDraft}
        />
      </div>
    </>
  );
}
