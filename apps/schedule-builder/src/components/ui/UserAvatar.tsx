"use client";

import * as Avatar from "@radix-ui/react-avatar";
import { type User } from "@supabase/supabase-js";

function getAvatarUrl(user: User): string | undefined {
  const avatarUrl: unknown = user.user_metadata.avatar_url;
  return typeof avatarUrl === "string" ? avatarUrl : undefined;
}

function getInitials(user: User): string {
  const name: unknown =
    user.user_metadata.full_name ?? user.user_metadata.name;
  if (typeof name === "string" && name.trim()) {
    return name
      .trim()
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }
  return (user.email?.[0] ?? "U").toUpperCase();
}

interface UserAvatarProps {
  user: User;
  className?: string;
}

export function UserAvatar({ user}: UserAvatarProps) {
  return (
    <Avatar.Root className="overflow-hidden relative block rounded-full size-[1em]">
      <Avatar.Image
        className="size-full rounded-full object-cover"
        src={getAvatarUrl(user)}
        alt={user.email ?? "User avatar"}
      />
      <Avatar.Fallback className="flex size-full items-center justify-center inset-ring-2 inset-ring-red-900 bg-red-800 text-sm font-semibold text-white">
        {getInitials(user)}
      </Avatar.Fallback>
    </Avatar.Root>
  );
}
