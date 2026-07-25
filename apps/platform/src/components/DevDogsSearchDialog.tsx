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
      {Icon && <Icon className="text-muted-foreground size-4 shrink-0" />}
      <div className="flex min-w-0 flex-col">
        {entry.breadcrumbs.length > 0 && (
          <div className="text-muted-foreground inline-flex items-center gap-0.5 text-xs">
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
        {entry.snippet ? (
          <div
            className="text-muted-foreground [&_mark]:text-popover-foreground line-clamp-2 min-w-0 text-xs [&_mark]:bg-transparent [&_mark]:font-medium [&_mark]:underline"
            // Server-built: HTML-escaped before sentinel → <mark> replacement.
            dangerouslySetInnerHTML={{ __html: entry.snippet }}
          />
        ) : (
          entry.description && (
            <div
              className="text-muted-foreground [&_mark]:text-popover-foreground min-w-0 truncate text-xs [&_mark]:bg-transparent [&_mark]:font-medium [&_mark]:underline"
              dangerouslySetInnerHTML={{
                __html: highlightMatches(entry.description, query),
              }}
            />
          )
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
  const pageResults = results.filter((entry) => entry.group !== "docs");
  const docsResults = results.filter((entry) => entry.group === "docs");

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
      <DialogContent
        className="top-1/3 translate-y-0 overflow-hidden rounded-xl p-0"
        showCloseButton={false}
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search pages, docs, and settings..."
            value={search}
            onValueChange={setSearch}
          />
          {showLocalPreviewAlert && (
            <div className="text-muted-foreground flex items-start gap-2 px-4 py-3 text-sm">
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
            {pageResults.length > 0 && (
              <CommandGroup heading="Pages">
                {pageResults.map((entry) => (
                  <SearchResultItem
                    key={entry.id}
                    entry={entry}
                    query={search}
                    onSelect={() => handleSelect(entry.url)}
                  />
                ))}
              </CommandGroup>
            )}
            {docsResults.length > 0 && (
              <CommandGroup heading="Docs">
                {docsResults.map((entry) => (
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
