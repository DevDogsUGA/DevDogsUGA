"use client";

import { useEffect, useState } from "react";
import type { SearchEntry } from "~/server/search/types";

export function useSiteSearch(): {
  search: string;
  setSearch: (query: string) => void;
  data: SearchEntry[] | "empty";
  isLoading: boolean;
} {
  const [search, setSearch] = useState("");
  const [data, setData] = useState<SearchEntry[] | "empty">("empty");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const trimmed = search.trim();
    if (!trimmed) {
      setData("empty");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      fetch(`/api/search?query=${encodeURIComponent(trimmed)}`, {
        signal: controller.signal,
      })
        .then((res) => res.json() as Promise<SearchEntry[]>)
        .then((entries) => {
          setData(entries);
          setIsLoading(false);
        })
        .catch((err: unknown) => {
          if (err instanceof Error && err.name === "AbortError") return;
          setData([]);
          setIsLoading(false);
        });
    }, 200);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [search]);

  return { search, setSearch, data, isLoading };
}
