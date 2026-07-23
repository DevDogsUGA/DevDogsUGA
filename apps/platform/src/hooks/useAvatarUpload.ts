"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "~/supabase/client";
import { env } from "~/env";
import createAvatarUploadUrl from "~/server/actions/createAvatarUploadUrl";
import { toast } from "~/lib/toast";

function avatarQueryKey(userId: string) {
  return ["avatar", userId] as const;
}

/**
 * Returns the best available avatar src for the given user — a local blob URL
 * immediately after upload, or the Supabase storage URL otherwise. Reactive:
 * every Avatar sharing the same userId updates together when one uploads.
 */
export function useAvatarSrc(userId: string) {
  const storageSrc = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${env.NEXT_PUBLIC_AVATARS_BUCKET}/${userId}`;
  const { data } = useQuery({
    queryKey: avatarQueryKey(userId),
    queryFn: () => storageSrc,
    initialData: storageSrc,
    staleTime: Infinity,
  });
  return data;
}

export function useAvatarUpload(userId: string) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({ file }: { file: File; croppedUrl: string }) => {
      const token = await createAvatarUploadUrl();
      const supabase = createClient();
      const { error } = await supabase.storage
        .from(env.NEXT_PUBLIC_AVATARS_BUCKET)
        .uploadToSignedUrl(userId, token, file, {
          upsert: true,
          cacheControl: "0, no-cache",
        });
      if (error) throw error;
    },
    onSuccess: (_, { croppedUrl }) => {
      // Revoke the previous blob URL (if any) before replacing it.
      const prev = queryClient.getQueryData<string>(avatarQueryKey(userId));
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      queryClient.setQueryData(avatarQueryKey(userId), croppedUrl);
      toast.success("Avatar updated");
    },
    onError: () => {
      toast.error("Failed to upload avatar");
    },
  });

  return {
    upload: mutation.mutate,
    isPending: mutation.isPending,
    error: mutation.error,
  };
}
