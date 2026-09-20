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

// The option list is virtualized so a multi-thousand-item Combobox (e.g. every
// instructor) renders only the rows on screen. Rows are single-line (checkbox +
// check icon + label), so a fixed height is safe; keep it in sync with the row's
// inline `height` below.
const ITEM_HEIGHT = 32;
// Extra rows rendered above/below the viewport so fast scrolling / keyboard
// paging never flashes blank space.
const OVERSCAN = 4;
// Matches the fieldset's `max-h-[140px]`. Used to size the visible window; a
// shorter box just over-renders a few rows, never too few.
const LIST_MAX_HEIGHT = 140;

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
  const [scrollTop, setScrollTop] = useState(0);

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

  // Windowed slice of `filteredOptions` to render. `scrollTop` is fed by the
  // fieldset's onScroll; the visible count is derived from the fixed row height.
  const totalOptions = filteredOptions.length;
  const startIndex = Math.max(
    0,
    Math.floor(scrollTop / ITEM_HEIGHT) - OVERSCAN,
  );
  const endIndex = Math.min(
    totalOptions,
    startIndex + Math.ceil(LIST_MAX_HEIGHT / ITEM_HEIGHT) + OVERSCAN * 2,
  );
  const visibleOptions = filteredOptions.slice(startIndex, endIndex);

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

    // Index math, not a DOM query: the highlighted row may be windowed out of
    // the DOM, so its position is derived from its index. Setting scrollTop
    // fires onScroll, which re-renders the visible window.
    requestAnimationFrame(() => {
      const el = fieldsetRef.current;
      if (!el) {
        return;
      }

      const index = filteredOptions.findIndex(
        (item) => item.value === highlighted,
      );
      if (index < 0) {
        return;
      }

      const itemTop = index * ITEM_HEIGHT;
      const itemBottom = itemTop + ITEM_HEIGHT;
      const viewTop = el.scrollTop;
      const viewBottom = viewTop + el.clientHeight;

      if (itemTop < viewTop) {
        el.scrollTop = itemTop;
      } else if (itemBottom > viewBottom) {
        el.scrollTop = itemBottom - el.clientHeight;
      }
    });
  }, [highlighted, filteredOptions, open]);

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
    // filtered list changes, while still allowing hover/keyboard to move it. The
    // window scrolls back to the top too, so a stale scrollTop can't leave the
    // shortened list showing blank space.
    if (fieldsetRef.current) {
      fieldsetRef.current.scrollTop = 0;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setScrollTop(0);
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
          className="border-edge-strong bg-surface [&:not(:disabled):hover]:border-muted flex w-full min-w-0 cursor-default items-center gap-3 rounded-md border-2 px-3 py-1.5 transition-[box-shadow,border-color] disabled:cursor-not-allowed disabled:opacity-60 data-[state=open]:pointer-events-none [&:not(:disabled):hover]:shadow-sm"
          suppressHydrationWarning
        >
          <span className="text-foreground/80 min-w-0 flex-1 truncate text-left peer-has-[option:checked]:hidden">
            {multiple ? displayText(values) : displayText(values[0])}
          </span>
          <CaretUpDownIcon className="shrink-0" />
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content className="border-muted bg-surface -mt-(--radix-popover-trigger-height) flex max-h-56 w-(--radix-popover-trigger-width) max-w-[calc(100dvw-1rem)] flex-col gap-1 rounded-md border-2 px-1 py-1 shadow-lg">
          <label className="peer bg-surface-muted flex w-full items-center gap-2 rounded-sm px-2 py-1">
            <MagnifyingGlassIcon className="text-foreground/80" />
            <input
              className="placeholder:text-foreground/80 flex-1 bg-transparent focus:outline-none"
              onChange={handleFilterChange}
              onKeyDown={handleKeydown}
              placeholder={searchPlaceholder ?? "Search items..."}
              value={filter}
            />
          </label>

          <fieldset
            className="relative max-h-[140px] overflow-y-auto"
            ref={fieldsetRef}
            onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
          >
            {totalOptions === 0 ? (
              <p className="text-foreground/80 px-2 py-1 text-sm italic">
                No results.
              </p>
            ) : (
              <div
                className="relative"
                style={{ height: totalOptions * ITEM_HEIGHT }}
              >
                {visibleOptions.map(({ value, content }, i) => {
                  const index = startIndex + i;
                  return (
                    <label
                      className="data-highlighted:bg-edge-strong absolute inset-x-0 flex items-center gap-2 overflow-hidden rounded-sm pr-2 has-checked:font-medium"
                      data-highlighted={highlighted === value || undefined}
                      key={String(value)}
                      onMouseEnter={() => setHighlighted(value)}
                      style={{ top: index * ITEM_HEIGHT, height: ITEM_HEIGHT }}
                    >
                      <input
                        className="peer shrink-0 appearance-none"
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
                        className="text-foreground shrink-0 opacity-0 peer-checked:opacity-100"
                      />
                      {/* Rows are fixed-height for virtualization, so options
                          must stay one line; long course titles truncate rather
                          than wrap into the next row. */}
                      <span className="min-w-0 flex-1 truncate">{content}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </fieldset>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
