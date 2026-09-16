import { Suspense } from "react";
import ScheduleDisplay from "~/components/schedules/ScheduleDisplay";

interface Props {
  params: Promise<{
    id: string;
  }>;
}

// Page for viewing a generated schedule / saved plan
export default async function SchedulePage({ params }: Props) {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-6 md:px-6">
      <Suspense fallback={<div>Loading...</div>}>
        <ScheduleDisplay id={(await params).id} />
      </Suspense>
    </div>
  );
}
