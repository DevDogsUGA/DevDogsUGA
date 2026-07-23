"use client";

import { Toaster as SonnerToaster } from "sonner";

export default function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      duration={4000}
      gap={8}
      expand={false}
    />
  );
}
