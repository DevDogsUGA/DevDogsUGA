import Avatar from "./Avatar";
import type { getProfilePageData } from "~/server/loaders/console";

type ProfileData = Awaited<ReturnType<typeof getProfilePageData>>;

export default function AvatarField({ id, profile }: ProfileData) {
  return (
    <span className="text-[4rem]/none">
      <Avatar editable userId={id} preferredName={profile.preferredName} />
    </span>
  );
}
