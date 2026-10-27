"use client";

import { useCallback, useRef, useState } from "react";
import ReactCrop, {
  centerCrop,
  convertToPixelCrop,
  makeAspectCrop,
  type PercentCrop,
} from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { UploadIcon } from "@phosphor-icons/react/ssr";
import FormButton from "~/components/FormButton";
import { DialogClose, DialogDescription, DialogTitle } from "~/ui/dialog";
import DialogShell from "~/ui/dialog-shell";

/**
 * Extracts the crop region from the `<img>` element and scales it to
 * `size`×`size` WebP. The crop is kept in percent of the image, so it maps
 * onto natural pixels directly, whatever size the preview rendered at.
 */
export async function exportCrop(
  imgEl: HTMLImageElement,
  crop: PercentCrop,
  size = 512,
  name = "avatar.webp",
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
          ? resolve(new File([blob], name, { type: "image/webp" }))
          : reject(new Error("Canvas serialization failed")),
      "image/webp",
      0.9,
    );
  });
}

interface CropDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Object URL of the picked file, or null before one is picked. */
  src: string | null;
  title: string;
  description: string;
  /** A circle for a profile photo, a plain square for an app logo. */
  circular?: boolean;
  /** Edge of the exported square, in pixels. */
  size?: number;
  fileName?: string;
  isPending: boolean;
  onPickAnother: () => void;
  /** Called with the cropped file once the member confirms. */
  onConfirm: (file: File) => void;
}

/**
 * The crop dialog behind the profile photo and an app's logo: a square crop
 * over the picked image, exported as WebP. Closing is blocked while an upload
 * is in flight.
 */
export default function CropDialog({
  open,
  onOpenChange,
  src,
  title,
  description,
  circular = false,
  size = 512,
  fileName = "avatar.webp",
  isPending,
  onPickAnother,
  onConfirm,
}: CropDialogProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  // In percent of the image, the one unit that means the same thing on
  // screen and in the file. Seeded on image load, so Upload works without a
  // drag.
  const [crop, setCrop] = useState<PercentCrop>();
  const [seenSrc, setSeenSrc] = useState(src);
  if (seenSrc !== src) {
    setSeenSrc(src);
    setCrop(undefined);
  }

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

  const handleSave = useCallback(async () => {
    if (!imgRef.current || !crop) return;
    onConfirm(await exportCrop(imgRef.current, crop, size, fileName));
  }, [crop, fileName, onConfirm, size]);

  return (
    <DialogShell
      open={open}
      onOpenChange={(next) => {
        if (!next && isPending) return;
        onOpenChange(next);
      }}
      tone="dark"
      header={
        <div className="flex flex-col gap-1 pr-10">
          <DialogTitle className="text-xl text-[var(--text)]">
            {title}
          </DialogTitle>
          <DialogDescription className="text-[var(--text-3)]">
            {description}
          </DialogDescription>
        </div>
      }
    >
      {src && (
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
            circularCrop={circular}
            keepSelection
            className="max-h-[55dvh]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={src}
              alt="Crop preview"
              onLoad={onImageLoad}
            />
          </ReactCrop>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <button
          type="button"
          className="textlink text-sm disabled:cursor-not-allowed disabled:opacity-50"
          onClick={onPickAnother}
          disabled={isPending}
        >
          Choose a different image
        </button>

        <div className="flex items-center gap-3">
          <DialogClose
            className="btn ghost disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isPending}
          >
            Cancel
          </DialogClose>
          <FormButton
            theme="cyan"
            type="button"
            onClick={handleSave}
            disabled={isPending || !crop}
          >
            <UploadIcon />
            Upload
          </FormButton>
        </div>
      </div>
    </DialogShell>
  );
}
