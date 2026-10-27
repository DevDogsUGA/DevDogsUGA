"use client";

import "./configEditor.css";

import { useActionState } from "react";
import {
  resetConfigEditAction,
  type ConfigActionState,
} from "~/server/actions/configEdits";
import { Button } from "~/ui/button";

const initialState: ConfigActionState = { ok: false, message: "" };

/** Resets one saved edit that no longer fits the official config. */
export default function OrphanReset({
  collection,
  editKey,
}: {
  collection: string;
  editKey: string;
}) {
  const [, reset, resetting] = useActionState(
    resetConfigEditAction,
    initialState,
  );
  return (
    <form action={reset} className="cfg-inline">
      <input type="hidden" name="collection" value={collection} />
      <input type="hidden" name="key" value={editKey} />
      <Button type="submit" size="sm" variant="secondary" disabled={resetting}>
        Reset
      </Button>
    </form>
  );
}
