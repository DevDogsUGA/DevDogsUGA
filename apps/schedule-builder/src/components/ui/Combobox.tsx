"use client";

import * as Popover from "@radix-ui/react-popover";
import { matchSorter } from "match-sorter";
import React, {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  CaretUpDownIcon,
  CheckIcon,
  MagnifyingGlassIcon,
} from "@phosphor-icons/react/ssr";

function getTextContent(node: ReactNode): string {
  if (!node) {
    return "";
  }

  if (typeof node !== "object") {
    return node.toString();
  }

  if (Symbol.iterator in node) {
    return Array.from(node)
      .map((child) => getTextContent(child))
      .join("");
  }

  if (
    "props" in node &&
    typeof node.props === "object" &&
    node.props &&
    "children" in node.props
  ) {
    return getTextContent(node.props.children as ReactNode);
  }

  return "";
}

type Props<T extends Record<string, ReactNode>> = {
  /**
   * Prevents user input if `true`. The Combobox will display as
   * translucent and use the `not-allowed` cursor when hovered.
   */
  disabled?: boolean;
  /**
   * An array of items to render as options.
   */
  options?: T;
  /**
   * The name passed to the underlying `<select />` element.
   */
  name?: string;
  /**
   * Marks the underlying `<select />` as required.
   */
  required?: boolean;
  /**
   * Disable automatic lexicographic sorting of options
   */
  preserveOrdering?: boolean;
  /**
   * The placeholder text displayed in the search input when the
   * popover is open.
   */
  searchPlaceholder?: string;
} & (
  | {
      /**
       * The value for the initially selected option.
       */
      defaultValue?: keyof T;
      /**
       * Calculate the text to display based on the currently selected item
       */
      displayText: (selection?: keyof T) => ReactNode;
      /**
       * Allow selection of multiple items
       */
      multiple?: false;
      /**
       * An event handler which fires when a new item is selected.
       * @param value The `value` of the selected item(s)
       */
      onChange?: (value: keyof T | undefined) => void;
      /**
       * Controls the value of the Combobox
       */
      value?: keyof T;
    }
  | {
      /**
       * The value for the initially selected option.
       */
      defaultValue?: (keyof T)[];
      /**
       * Calculate the text to display based on the currently selected items
       */
      displayText: (selection: (keyof T)[]) => ReactNode;
      /**
       * Allow selection of multiple items
       */
      multiple: true;
      /**
       * An event handler which fires when a new item is selected.
       * @param value The `value` of the selected item(s)
       */
      onChange?: (value: (keyof T)[]) => void;
      /**
       * Controls the value of the Combobox
       */
      value?: (keyof T)[];
    }
);

/**
 * A wrapper for `<select />` that shows a popover over the original element,
 * with a search input for filtering the options. Keyboard navigation and
 * selection work in the popover. Options are NOT virtualized, so very long
 * lists get slow.
 */
export default function Combobox<T extends Record<string, ReactNode>>({
  defaultValue,
  displayText,
  disabled,
  multiple,
  name,
  onChange,
  options,
  preserveOrdering,
  required,
  searchPlaceholder,
  value: controlledValue,
}: Props<T>) {
  const id = useId();
  const fieldsetRef = useRef<HTMLFieldSetElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");

  const [selection, setSelection] = useState(
    defaultValue
      ? defaultValue instanceof Array
        ? defaultValue
        : [defaultValue]
      : [],
  );

  const values = useMemo(
    () =>
      controlledValue
        ? controlledValue instanceof Array
          ? controlledValue
          : [controlledValue]
        : selection,
    [controlledValue, selection],
  );

  const matchableOptions = useMemo(
    () =>
      options
        ? (Object.entries(options) as Array<[keyof T, ReactNode]>).map(
            ([value, content]) => ({
              value: value,
              content,
              textContent: getTextContent(content),
            }),
          )
        : [],
    [options],
  );

  const filteredOptions = useMemo(
    () =>
      options
        ? matchSorter(matchableOptions, filter, {
            ...(preserveOrdering
              ? { baseSort: (a, b) => (a.index < b.index ? -1 : 1) }
              : {}),
            keys: ["content"],
          })
        : [],
    [options, matchableOptions, filter, preserveOrdering],
  );

  const [highlighted, setHighlighted] = useState(values[0]);

  const select = useCallback(
    (target: keyof T | undefined) => {
      if (!target) {
        return;
      }

      setSelection((selection) => {
        if (selection.includes(target)) {
          return selection.filter((value) => value !== target);
        }

        if (multiple) {
          return [...selection, target];
        }

        return [target];
      });
    },
    [multiple],
  );

  const handleFilterChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setFilter(e.currentTarget.value);
    },
    [],
  );

  const handleOptionChange = useCallback(
    (value: keyof T) => {
      setHighlighted(value);
      select(value);
    },
    [select],
  );

  /**
   * Handles Enter and the up/down arrow keys.
   */
  const handleKeydown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        select(highlighted);
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlighted(
          (h) =>
            filteredOptions[
              (((filteredOptions.findIndex((item) => item.value === h) - 1) %
                filteredOptions.length) +
                filteredOptions.length) %
                filteredOptions.length
            ]?.value,
        );
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlighted(
          (h) =>
            filteredOptions[
              (((filteredOptions.findIndex((item) => item.value === h) + 1) %
                filteredOptions.length) +
                filteredOptions.length) %
                filteredOptions.length
            ]?.value,
        );
        return;
      }
    },
    // `filteredOptions` is load-bearing and was missing. Without it the callback
    // keeps whichever list existed when `highlighted` last changed, so typing a
    // filter then pressing ArrowDown walks the PRE-FILTER options: the highlight
    // jumps to an entry that is not on screen, and Enter selects it.
    [highlighted, filteredOptions, select],
  );

  /**
   * Resets the Combobox to the initial state.
   */
  const handleReset = useCallback(() => {
    setFilter("");
    setHighlighted(undefined);
    setSelection(
      defaultValue
        ? defaultValue instanceof Array
          ? defaultValue
          : [defaultValue]
        : [],
    );
    // `defaultValue`, not `options`. The body never reads `options`, and
    // `defaultValue` decides what "reset" restores, so a form reset used to
    // restore whatever default was current when `options` last changed.
  }, [defaultValue]);

  /**
   * Open/close the popover, resetting the filter and highlight on close.
   * Handled here (rather than in an effect) so state updates stay in the event.
   */
  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (!next) {
        setFilter("");
        setHighlighted(values[0]);
      }
    },
    [values],
  );

  /**
   * Scrolls the highlighted option into view whenever it changes.
   */
  useEffect(() => {
    if (highlighted === undefined) {
      return;
    }

    requestAnimationFrame(() => {
      const item: HTMLElement | undefined | null =
        fieldsetRef.current?.querySelector(
          `label:has([name="${name ?? id}"][value="${String(highlighted)}"])`,
        );

      if (!fieldsetRef.current || !item) {
        return;
      }

      const fieldsetTop = fieldsetRef.current.scrollTop;
      const fieldsetBottom = fieldsetTop + fieldsetRef.current.clientHeight;
      const itemTop = item.offsetTop;
      const itemBottom = itemTop + item.clientHeight;

      if (itemBottom > fieldsetBottom) {
        item.scrollIntoView({ block: "end" });
      }

      if (itemTop < fieldsetTop) {
        item.scrollIntoView({ block: "start" });
      }
    });
  }, [highlighted, id, name, open]);

  /**
   * Trigger `handleReset(...)` when the parent form is reset.
   */
  useEffect(() => {
    if (!selectRef.current?.form) {
      return;
    }

    const controller = new AbortController();
    selectRef.current.form.addEventListener("reset", handleReset, controller);
    return () => controller.abort();
  }, [handleReset]);

  useEffect(() => {
    if (multiple) {
      onChange?.(selection);
    } else {
      onChange?.(selection[0]);
      // Intentional: auto-close the single-select popover after a selection is
      // made through any path (checkbox, Enter key). Restructuring into each
      // handler would miss the keyboard path, so we sync on the value change.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpen(false);
    }
    // `onChange` is deliberately NOT a dependency, and this is the one place in
    // the file where following exhaustive-deps would make things worse. Callers
    // pass an inline arrow, so its identity changes on every parent render; as
    // a dependency it would re-fire this effect each time, call `onChange`
    // again, and re-render the parent -- a loop, from a rule meant to prevent
    // staleness. `multiple` is left out for the ordinary reason: it does not
    // change over a mounted Combobox's life.
    //
    // Known wart, left alone because fixing it is a behaviour change rather
    // than a lint fix: the effect keys on `values` (which folds in
    // `controlledValue`) but reports `selection`. For a CONTROLLED combobox a
    // change from the parent therefore fires a notification carrying the
    // internal selection instead of the controlled value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values]);

  useEffect(() => {
    // Intentional: reset the keyboard highlight to the first result whenever the
    // filtered list changes, while still allowing hover/keyboard to move it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHighlighted(filteredOptions[0]?.value);
  }, [filteredOptions]);

  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange}>
      <select
        className="hidden"
        onChange={() => {
          /* Controlled via `value`; selection is driven by the popover. */
        }}
        name={name}
        ref={selectRef}
        required={required}
        multiple={multiple}
        tabIndex={-1}
        value={multiple ? values.map(String) : String(values[0])}
      >
        {values.map((value) => (
          <option key={String(value)} value={String(value)} />
        ))}
      </select>

      <Popover.Trigger
        disabled={disabled === true || options === undefined}
        asChild
      >
        <button
          className="flex w-full cursor-default items-center gap-6 rounded-md border-2 border-stone-300 bg-white px-3 py-1.5 transition-[box-shadow,border-color] disabled:cursor-not-allowed disabled:opacity-60 data-[state=open]:pointer-events-none [&:not(:disabled):hover]:border-stone-400 [&:not(:disabled):hover]:shadow-sm"
          suppressHydrationWarning
        >
          <span className="flex-1 text-left text-neutral-600 peer-has-[option:checked]:hidden">
            {multiple ? displayText(values) : displayText(values[0])}
          </span>
          <CaretUpDownIcon />
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content className="-mt-(--radix-popover-trigger-height) flex max-h-56 w-(--radix-popover-trigger-width) max-w-[calc(100dvw-1rem)] flex-col gap-1 rounded-md border-2 border-stone-400 bg-white px-1 py-1 shadow-lg">
          <label className="peer flex w-full items-center gap-2 rounded-sm bg-neutral-100 px-2 py-1">
            <MagnifyingGlassIcon className="text-neutral-700" />
            <input
              className="flex-1 bg-transparent placeholder:text-neutral-700 focus:outline-none"
              onChange={handleFilterChange}
              onKeyDown={handleKeydown}
              placeholder={searchPlaceholder ?? "Search items..."}
              value={filter}
            />
          </label>

          <fieldset
            className="relative flex max-h-[140px] snap-y snap-mandatory flex-col gap-1 overflow-y-auto"
            ref={fieldsetRef}
          >
            <div className="peer contents">
              {filteredOptions.map(({ value, content }) => (
                <label
                  className="flex snap-start items-center gap-2 rounded-sm py-1 pr-2 has-checked:font-medium data-highlighted:bg-stone-300"
                  data-highlighted={highlighted === value || undefined}
                  key={String(value)}
                  onMouseEnter={() => setHighlighted(value)}
                >
                  <input
                    className="peer appearance-none"
                    name={name ?? id}
                    checked={values.includes(value)}
                    onChange={() => {
                      handleOptionChange(value);
                    }}
                    value={String(value)}
                    type="checkbox"
                  />
                  <CheckIcon
                    weight="bold"
                    className="text-gray-800 opacity-0 peer-checked:opacity-100"
                  />
                  {content}
                </label>
              ))}
            </div>

            <p className="hidden px-2 py-1 text-sm text-neutral-700 italic peer-empty:block">
              No results.
            </p>
          </fieldset>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
