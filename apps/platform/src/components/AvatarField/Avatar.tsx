"use client";

import { Fallback, Image, Root } from "@radix-ui/react-avatar";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ReactCrop, {
  centerCrop,
  convertToPixelCrop,
  makeAspectCrop,
  type PercentCrop,
} from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { CameraIcon, UploadIcon } from "@phosphor-icons/react/ssr";
import { useAvatarSrc, useAvatarUpload } from "~/hooks/useAvatarUpload";
import { DialogClose, DialogDescription, DialogTitle } from "~/ui/dialog";
import DialogShell from "~/ui/dialog-shell";

import FormButton from "~/components/FormButton";

/**
 * Extracts the crop region from the `<img>` element and scales it to
 * `size`×`size` WebP. The crop is kept in percent of the image, so it maps
 * onto natural pixels directly, whatever size the preview rendered at.
 */
async function exportCrop(
  imgEl: HTMLImageElement,
  crop: PercentCrop,
  size = 512,
): Promise<File> {
  const { x, y, width, height } = convertToPixelCrop(
    crop,
    imgEl.naturalWidth,
    imgEl.naturalHeight,
  );

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  canvas
    .getContext("2d")!
    .drawImage(imgEl, x, y, width, height, 0, 0, size, size);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(new File([blob], "avatar.webp", { type: "image/webp" }))
          : reject(new Error("Canvas serialization failed")),
      "image/webp",
      0.9,
    );
  });
}

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
  const imgRef = useRef<HTMLImageElement>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  // Blob URL of the file currently loaded in the cropper.
  const [pendingSrc, setPendingSrc] = useState<string | null>(null);
  // In percent of the image, the one unit that means the same thing on
  // screen and in the file. Seeded on image load, so Upload works without a
  // drag.
  const [crop, setCrop] = useState<PercentCrop>();

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
      setCrop(undefined);
      setDialogOpen(true);
      e.target.value = "";
    },
    [pendingSrc],
  );

  const onImageLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const { width, height } = e.currentTarget;
      setCrop(
        centerCrop(
          makeAspectCrop({ unit: "%", width: 90 }, 1, width, height),
          width,
          height,
        ),
      );
    },
    [],
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

  const handleSave = useCallback(async () => {
    if (!imgRef.current || !crop) return;
    const file = await exportCrop(imgRef.current, crop);
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
  }, [crop, pendingSrc, router, upload]);

  const avatarVisual = (
    <Root className="inline-flex size-[1em] items-center justify-center overflow-hidden rounded-full border border-mauve-900 bg-linear-to-br from-cyan-400 to-cyan-500 align-middle shadow-xs select-none">
      <Image
        src={avatarSrc}
        alt={preferredName}
        className="size-full rounded-[inherit] object-cover"
      />
      <Fallback className="text-[0.5em]/none font-bold text-mauve-900">
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
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
          <CameraIcon className="size-[0.35em] text-white" />
        </span>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp,image/avif"
        className="hidden"
        onChange={handleFileChange}
      />

      <DialogShell
        open={dialogOpen}
        onOpenChange={handleOpenChange}
        tone="dark"
        header={
          <div className="flex flex-col gap-1 pr-10">
            <DialogTitle className="font-display text-xl font-extrabold text-white">
              Crop Photo
            </DialogTitle>
            <DialogDescription className="text-mauve-400">
              Drag the circle to frame your photo.
            </DialogDescription>
          </div>
        }
      >
        {pendingSrc && (
          <div className="flex justify-center">
            {/* The image renders at its own aspect ratio, never letterboxed:
                the crop is measured against the <img> box, so any empty
                space inside it would be croppable and would skew the
                mapping back to the file's pixels. ReactCrop's stylesheet
                caps the <img> at this max-height and the full width. */}
            <ReactCrop
              crop={crop}
              onChange={(_, percentCrop) => setCrop(percentCrop)}
              aspect={1}
              circularCrop
              keepSelection
              className="max-h-[55dvh]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={imgRef}
                src={pendingSrc}
                alt="Crop preview"
                onLoad={onImageLoad}
              />
            </ReactCrop>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-4">
          <button
            type="button"
            className="text-sm text-mauve-400 hover:text-white hover:underline disabled:cursor-not-allowed disabled:opacity-50"
            onClick={openFilePicker}
            disabled={isPending}
          >
            Choose a different image
          </button>

          <div className="flex items-center gap-3">
            <DialogClose
              className="rounded-lg border border-white/20 px-4 py-1.5 text-sm text-white/70 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isPending}
            >
              Cancel
            </DialogClose>
            <FormButton
              theme="black"
              type="button"
              className="text-sm"
              onClick={handleSave}
              disabled={isPending || !crop}
            >
              <UploadIcon />
              Upload
            </FormButton>
          </div>
        </div>
      </DialogShell>
    </>
  );
}
