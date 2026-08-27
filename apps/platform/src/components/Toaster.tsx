"use client";

import { Toaster as SonnerToaster } from "sonner";

export default function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      duration={4000}
      // The card throws a 5px block shadow down and to the right (see
      // ~/ui/toast). At sonner's default 8 the block of one toast lands
      // almost on the face of the next; 14 leaves the same clear gap between
      // stacked cards that 8 gave before the shadow grew.
      gap={14}
      expand={false}
    />
  );
}
