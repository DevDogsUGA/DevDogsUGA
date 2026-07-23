"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { connectPreviewSocket } from "@devdogsuga/docs-preview/client";

export function PreviewRefreshClient() {
  const router = useRouter();
  useEffect(() => connectPreviewSocket(() => router.refresh()), [router]);
  return null;
}
