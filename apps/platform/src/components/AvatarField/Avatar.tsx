"use client";

import { Fallback, Image, Root } from "@radix-ui/react-avatar";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CameraIcon } from "@phosphor-icons/react/ssr";
import { useAvatarSrc, useAvatarUpload } from "~/hooks/useAvatarUpload";
import CropDialog from "./CropDialog";

interface AvatarProps {
  userId: string;
  preferredName: string;
  editable?: boolean;
}

export default function Avatar({
  userId,
  preferredName,
  editable = false,
}: AvatarProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  // Blob URL of the file currently loaded in the cropper.
  const [pendingSrc, setPendingSrc] = useState<string | null>(null);

  const avatarSrc = useAvatarSrc(userId);
  const { upload, isPending } = useAvatarUpload(userId);

  const initials = preferredName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  // Revoke the pending blob URL on unmount to prevent memory leaks.
  useEffect(() => {
    return () => {
      if (pendingSrc) URL.revokeObjectURL(pendingSrc);
    };
  }, [pendingSrc]);

  const openFilePicker = useCallback(() => inputRef.current?.click(), []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (pendingSrc) URL.revokeObjectURL(pendingSrc);
      setPendingSrc(URL.createObjectURL(file));
      setDialogOpen(true);
      e.target.value = "";
    },
    [pendingSrc],
  );

  const handleOpenChange = useCallback(
    (open: boolean) => {
      // Prevent closing while an upload is in flight.
      if (!open && isPending) return;
      if (!open && pendingSrc) {
        URL.revokeObjectURL(pendingSrc);
        setPendingSrc(null);
      }
      setDialogOpen(open);
    },
    [isPending, pendingSrc],
  );

  const handleSave = useCallback(
    (file: File) => {
      const croppedUrl = URL.createObjectURL(file);

      upload(
        { file, croppedUrl },
        {
          onSuccess: () => {
            if (pendingSrc) URL.revokeObjectURL(pendingSrc);
            setPendingSrc(null);
            setDialogOpen(false);
            router.refresh();
          },
          onError: () => {
            URL.revokeObjectURL(croppedUrl);
          },
        },
      );
    },
    [pendingSrc, router, upload],
  );

  const avatarVisual = (
    <Root className="avatar align-middle select-none">
      <Image
        src={avatarSrc}
        alt={preferredName}
        className="size-full object-cover"
      />
      <Fallback className="flex size-full items-center justify-center">
        {initials}
      </Fallback>
    </Root>
  );

  if (!editable) return avatarVisual;

  return (
    <>
      <button
        type="button"
        className="group relative inline-flex cursor-pointer align-middle"
        onClick={openFilePicker}
        aria-label="Change profile photo"
      >
        {avatarVisual}
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[color-mix(in_srgb,var(--bg)_70%,transparent)] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <CameraIcon className="size-7 text-[var(--text)]" />
        </span>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp,image/avif"
        className="hidden"
        onChange={handleFileChange}
      />

      <CropDialog
        open={dialogOpen}
        onOpenChange={handleOpenChange}
        src={pendingSrc}
        title="Crop Photo"
        description="Drag the circle to frame your photo."
        circular
        isPending={isPending}
        onPickAnother={openFilePicker}
        onConfirm={handleSave}
      />
    </>
  );
}
