"use client";

import { useRouter } from "next/navigation";
import { CreatePlanDialog } from "~/components/plans/CreatePlanDialog";

export default function CreatePlanPage() {
  const router = useRouter();
  return <CreatePlanDialog onClose={() => router.push("/plans")} />;
}
