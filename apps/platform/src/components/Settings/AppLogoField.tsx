"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { UploadSimpleIcon } from "@phosphor-icons/react/ssr";
import CropDialog from "~/components/AvatarField/CropDialog";
import { env } from "~/env";
import { failure, success } from "~/lib/actionResult";
import {
  createAppLogoUploadToken,
  saveAppLogo,
} from "~/server/actions/oauthApps";
import { logoLetter } from "~/server/oauth/consentScreen";
import { createClient } from "~/supabase/client";
import { Button } from "~/ui/button";
import { CommandFeedback, useCommand } from "~/ui/use-command";

const LOGO_EDGE = 256;
const ACCEPT = "image/jpeg,image/png,image/gif,image/webp,image/avif";

/**
 * An app's logo: shown as it will appear on the consent screen, changed
 * through the same crop dialog as a profile photo. The cropped square is
 * uploaded to our own storage (the public avatars bucket, at the one path this
 * app's logo may have) and never read from the app's server (Q159).
 */
export default function AppLogoField({
  clientId,
  label,
  logoUrl,
}: {
  clientId: string;
  label: string;
  logoUrl: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pendingSrc, setPendingSrc] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  // The cropped file, shown at once while the refreshed page catches up.
  const [uploadedSrc, setUploadedSrc] = useState<string | null>(null);
  const shown = uploadedSrc ?? logoUrl;

  function pick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (pendingSrc) URL.revokeObjectURL(pendingSrc);
    setPendingSrc(URL.createObjectURL(file));
    setOpen(true);
  }

  function close(next: boolean) {
    setOpen(next);
    if (!next && pendingSrc) {
      URL.revokeObjectURL(pendingSrc);
      setPendingSrc(null);
    }
  }

  // The logo is a flow of three steps (a token, the browser's own upload to
  // Storage, then recording the path), so it is composed here from two Commands
  // and one client step, and any step's refusal comes back as the result.
  const {
    run: upload,
    pending: saving,
    result,
  } = useCommand(async (file: File) => {
    const token = await createAppLogoUploadToken(clientId);
    if (!token.ok || !token.data) return token;
    const { path, token: uploadToken, maxBytes } = token.data;
    if (file.size > maxBytes) {
      return failure("That logo is too large. Try a smaller image");
    }
    const { error } = await createClient()
      .storage.from(env.NEXT_PUBLIC_AVATARS_BUCKET)
      .uploadToSignedUrl(path, uploadToken, file, {
        cacheControl: "0, no-cache",
      });
    if (error) return failure("Failed to upload the logo");
    const saved = await saveAppLogo(clientId, path);
    if (!saved.ok) return saved;
    setUploadedSrc(URL.createObjectURL(file));
    close(false);
    return success(undefined, "Logo updated");
  });

  return (
    <div className="field">
      <span className="label">Logo</span>
      <div className="row" style={{ gap: 14, alignItems: "center" }}>
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={shown}
            alt={`${label} logo`}
            width={56}
            height={56}
            className="size-14 rounded-lg object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="grid size-14 place-items-center rounded-lg bg-[var(--surface-2,var(--bg))] text-xl font-semibold"
          >
            {logoLetter(label)}
          </span>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
        >
          <UploadSimpleIcon aria-hidden />
          {shown ? "Change logo" : "Upload logo"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          aria-label={`Upload a logo for ${label}`}
          onChange={pick}
        />
      </div>
      <span className="help">
        Square, shown on the consent screen. Uploaded to DevDogs, never linked
        from your server.
      </span>
      {!open && <CommandFeedback result={result} />}
      <CropDialog
        open={open}
        onOpenChange={close}
        src={pendingSrc}
        title="Crop logo"
        description="Drag the square to frame your logo."
        size={LOGO_EDGE}
        fileName="logo.webp"
        isPending={saving}
        feedback={<CommandFeedback result={result} />}
        onPickAnother={() => inputRef.current?.click()}
        onConfirm={upload}
      />
    </div>
  );
}
