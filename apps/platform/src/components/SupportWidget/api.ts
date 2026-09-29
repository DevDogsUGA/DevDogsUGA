"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  SupportInbox,
  SupportSuggestion,
  SupportThread,
} from "~/lib/support/types";

/** Every support route answers failures as `{ error }`; surface that text. */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: init?.body
      ? { "content-type": "application/json", ...init.headers }
      : init?.headers,
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? `Request failed (${response.status}).`);
  }
  return response.status === 204
    ? (undefined as T)
    : ((await response.json()) as T);
}

const INBOX_KEY = ["support", "inbox"] as const;
const threadKey = (threadId: string) =>
  ["support", "thread", threadId] as const;

/**
 * The inbox, refreshed every minute while `enabled` for the launcher's
 * unread badge. React Query pauses interval refetches in background tabs, so
 * a forgotten docs tab costs nothing.
 */
export function useInbox(enabled: boolean) {
  return useQuery({
    queryKey: INBOX_KEY,
    queryFn: () => request<SupportInbox>("/support"),
    enabled,
    refetchInterval: 60_000,
    staleTime: 10_000,
  });
}

/** One conversation, polled every ten seconds while it is on screen. */
export function useThread(threadId: string | null) {
  return useQuery({
    queryKey: threadKey(threadId ?? ""),
    queryFn: () => request<SupportThread>(`/support/conversations/${threadId}`),
    enabled: threadId !== null,
    refetchInterval: 10_000,
  });
}

export function useSuggestions(query: string) {
  return useQuery({
    queryKey: ["support", "suggest", query],
    queryFn: ({ signal }) =>
      request<SupportSuggestion[]>(
        `/support/suggest?q=${encodeURIComponent(query)}`,
        { signal },
      ),
    enabled: query.length >= 4,
    staleTime: 60_000,
  });
}

export interface StartInput {
  title: string;
  body: string;
  page: { path: string; title: string } | null;
  turnstileToken?: string;
}

export function useStart() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: StartInput) =>
      request<{ threadId: string }>("/support/conversations", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: INBOX_KEY }),
  });
}

export function useReply(threadId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: string) =>
      request<void>(`/support/conversations/${threadId}/messages`, {
        method: "POST",
        body: JSON.stringify({ body }),
      }),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: threadKey(threadId) }),
        client.invalidateQueries({ queryKey: INBOX_KEY }),
      ]),
  });
}

export function useResolve(threadId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () =>
      request<void>(`/support/conversations/${threadId}/resolve`, {
        method: "POST",
      }),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: threadKey(threadId) }),
        client.invalidateQueries({ queryKey: INBOX_KEY }),
      ]),
  });
}

export function useFollow() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { threadId: string; turnstileToken?: string }) =>
      request<void>(`/support/conversations/${input.threadId}/follow`, {
        method: "POST",
        body: JSON.stringify({ turnstileToken: input.turnstileToken }),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: INBOX_KEY }),
  });
}
