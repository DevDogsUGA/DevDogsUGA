"use client";

import { Fragment } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CaretRightIcon, WarningIcon } from "@phosphor-icons/react/ssr";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "~/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/ui/dialog";
import { highlightMatches } from "~/server/search/match";
import type { SearchEntry } from "~/server/search/types";
import * as icons from "~/config/icons";
import { useSiteSearch } from "../hooks/useSiteSearch";

function SearchResultItem({
  entry,
  query,
  onSelect,
}: {
  entry: SearchEntry;
  query: string;
  onSelect: () => void;
}) {
  const Icon = icons[entry.icon];

  return (
    <CommandItem value={entry.id} onSelect={onSelect} className="gap-2.5">
      {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" />}
      <div className="flex min-w-0 flex-col">
        {entry.breadcrumbs.length > 0 && (
          <div className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
            {entry.breadcrumbs.map((b, i) => (
              <Fragment key={i}>
                {i > 0 && <CaretRightIcon className="size-3" />}
                <span>{b}</span>
              </Fragment>
            ))}
          </div>
        )}
        <div
          className="min-w-0 truncate font-medium [&_mark]:bg-transparent [&_mark]:font-bold [&_mark]:text-white [&_mark]:underline"
          dangerouslySetInnerHTML={{
            __html: highlightMatches(entry.title, query),
          }}
        />
        {entry.description && (
          <div
            className="min-w-0 truncate text-xs text-muted-foreground [&_mark]:bg-transparent [&_mark]:font-medium [&_mark]:text-popover-foreground [&_mark]:underline"
            dangerouslySetInnerHTML={{
              __html: highlightMatches(entry.description, query),
            }}
          />
        )}
      </div>
    </CommandItem>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function DevDogsSearchDialog({ open, onOpenChange }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { search, setSearch, data, isLoading } = useSiteSearch();
  const showLocalPreviewAlert = pathname.startsWith("/tools/docs");

  const results = data !== "empty" ? data : [];
  const hasResults = results.length > 0;

  function handleSelect(url: string) {
    onOpenChange(false);
    router.push(url);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader className="sr-only">
        <DialogTitle>Search</DialogTitle>
        <DialogDescription>Search pages, docs, and settings</DialogDescription>
      </DialogHeader>
      <DialogContent className="top-1/3 translate-y-0 overflow-hidden rounded-xl p-0" showCloseButton={false}>
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search pages, docs, and settings..."
            value={search}
            onValueChange={setSearch}
          />
          {showLocalPreviewAlert && (
            <div className="flex items-start gap-2 px-4 py-3 text-sm text-muted-foreground">
              <WarningIcon className="size-4 shrink-0 translate-y-0.5" />
              <p>
                Local preview files aren&apos;t searchable. Results below only
                cover content already published on GitHub.
              </p>
            </div>
          )}
          <CommandList>
            {!isLoading && search.trim() && !hasResults && (
              <CommandEmpty>No results found.</CommandEmpty>
            )}
            {hasResults && (
              <CommandGroup>
                {results.map((entry) => (
                  <SearchResultItem
                    key={entry.id}
                    entry={entry}
                    query={search}
                    onSelect={() => handleSelect(entry.url)}
                  />
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
