import { type Metadata } from "next";
import { ComingSoon } from "~/components/ComingSoon";

export const metadata: Metadata = { title: "Schedule Generation" };

export default function GenerateSchedulesPage() {
  return <ComingSoon title="Schedule Generation" />;
}
