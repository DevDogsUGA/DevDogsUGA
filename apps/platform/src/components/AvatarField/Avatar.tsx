"use client";

import { Fallback, Image, Root } from "@radix-ui/react-avatar";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ReactCrop, {
  centerCrop,
  makeAspectCrop,
  type Crop,
  type PixelCrop,
} from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { CameraIcon, UploadIcon, XIcon } from "@phosphor-icons/react/ssr";
import { useAvatarSrc, useAvatarUpload } from "~/hooks/useAvatarUpload";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/ui/dialog";

import FormButton from "~/components/FormButton";

/**
 * Extracts the crop region from the rendered `<img>` element and
 * downscales to `size`×`size` WebP. Uses the rendered dimensions to
 * derive the scale factor back to natural pixel coordinates.
 */
async function exportCrop(
  imgEl: HTMLImageElement,
  pixelCrop: PixelCrop,
  size = 512,
): Promise<File> {
  const scaleX = imgEl.naturalWidth / imgEl.width;
  const scaleY = imgEl.naturalHeight / imgEl.height;

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  canvas
    .getContext("2d")!
    .drawImage(
      imgEl,
      pixelCrop.x * scaleX,
      pixelCrop.y * scaleY,
      pixelCrop.width * scaleX,
      pixelCrop.height * scaleY,
      0,
      0,
      size,
      size,
    );

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
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();

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
      setCompletedCrop(undefined);
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
    if (!imgRef.current || !completedCrop) return;
    const file = await exportCrop(imgRef.current, completedCrop);
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
  }, [completedCrop, pendingSrc, router, upload]);

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

      <Dialog open={dialogOpen} onOpenChange={handleOpenChange}>
        <DialogContent
          className="shadow-block max-w-lg overflow-hidden border-black bg-white p-0"
          onInteractOutside={(e) => isPending && e.preventDefault()}
          onEscapeKeyDown={(e) => isPending && e.preventDefault()}
          showCloseButton={false}
        >
          <DialogHeader className="flex-row items-center justify-between px-4 pt-4 pb-2">
            <DialogTitle className="text-lg font-semibold">
              Crop Photo
            </DialogTitle>
            <DialogClose
              className="rounded-sm p-1 text-mauve-500 hover:bg-mauve-100 hover:text-mauve-800 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isPending}
              aria-label="Close"
            >
              <XIcon />
            </DialogClose>
          </DialogHeader>

          <div className="bg-white">
            {pendingSrc && (
              <ReactCrop
                crop={crop}
                onChange={setCrop}
                onComplete={setCompletedCrop}
                aspect={1}
                circularCrop
                keepSelection
                className="max-h-[60vh] w-full"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  ref={imgRef}
                  src={pendingSrc}
                  alt="Crop preview"
                  className="max-h-[60vh] w-full object-contain"
                  onLoad={onImageLoad}
                />
              </ReactCrop>
            )}
          </div>

          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <button
              type="button"
              className="text-sm text-mauve-500 hover:text-mauve-800 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
              onClick={openFilePicker}
              disabled={isPending}
            >
              Choose a different image
            </button>

            <div className="flex items-center gap-2">
              <DialogClose
                className="rounded-sm border border-black bg-white px-4 py-1 text-sm text-mauve-700 transition-[background-color] hover:bg-mauve-100 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isPending}
              >
                Cancel
              </DialogClose>
              <FormButton
                theme="black"
                type="button"
                className="gap-1.5 px-4 py-1 text-sm font-medium"
                onClick={handleSave}
                disabled={isPending || !completedCrop}
              >
                <UploadIcon />
                Upload
              </FormButton>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
