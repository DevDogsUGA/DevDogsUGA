import { Skeleton } from "~/ui/skeleton";

/** Stands in for the avatar inside the navbar's list, so it renders an <li>. */
export default function UserClusterSkeleton() {
  return (
    <li className="flex items-center">
      <Skeleton className="size-8 shrink-0 rounded-full bg-mauve-800" />
    </li>
  );
}
