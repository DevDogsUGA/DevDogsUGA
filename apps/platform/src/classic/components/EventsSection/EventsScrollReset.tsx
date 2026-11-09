"use client";

import { useLayoutEffect } from "react";

/**
 * Reset only when the persistent events layout is entered.
 *
 * The `/events` page itself renders no DOM: its schedule belongs to the parent
 * layout so it can remain mounted behind meeting and directions route dialogs.
 * Next's normal link handling therefore has no leaf-page element to scroll to
 * and can preserve the previous page's low scroll position. This layout-level
 * effect runs before paint on entry, but not while moving among routes inside
 * the already-mounted events layout, so opening and closing a dialog still
 * preserves the calendar underneath it.
 */
export default function EventsScrollReset() {
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  return null;
}
