"use client";

import "./graphics.css";

import { useRef, useState, type ReactNode } from "react";
import { buttonVariants } from "~/ui/button";

/**
 * The form around a meeting's preview grid. Every tile holds a `pick`
 * checkbox; submitting is a plain GET to the ZIP route, so the download is the
 * browser's own and nothing is buffered in the page.
 *
 * The one script here keeps the button honest: it is off until something is
 * ticked (an empty ZIP is a 400), says how many, and offers Select all/Clear.
 */
export default function ZipForm({
  action,
  max,
  children,
}: {
  action: string;
  /** The most images one ZIP may hold (`MAX_PICKS`). */
  max: number;
  children: ReactNode;
}) {
  const form = useRef<HTMLFormElement>(null);
  const [count, setCount] = useState(0);

  function sync() {
    if (form.current) {
      setCount(new FormData(form.current).getAll("pick").length);
    }
  }

  function setAll(checked: boolean) {
    form.current
      ?.querySelectorAll<HTMLInputElement>('input[name="pick"]')
      .forEach((box) => {
        box.checked = checked;
      });
    sync();
  }

  return (
    <form ref={form} method="get" action={action} onChange={sync}>
      <div className="gfx-bar">
        <button
          type="submit"
          className={buttonVariants({ variant: "default" })}
          disabled={count === 0 || count > max}
        >
          Download ZIP
        </button>
        <button
          type="button"
          className={buttonVariants({ variant: "outline", size: "sm" })}
          onClick={() => setAll(true)}
        >
          Select all
        </button>
        <button
          type="button"
          className={buttonVariants({ variant: "ghost", size: "sm" })}
          onClick={() => setAll(false)}
        >
          Clear
        </button>
        <span className="gfx-count" aria-live="polite">
          {count === 0
            ? "Nothing selected"
            : count > max
              ? `${count} selected: a ZIP holds at most ${max}`
              : `${count} selected`}
        </span>
      </div>
      {children}
    </form>
  );
}
