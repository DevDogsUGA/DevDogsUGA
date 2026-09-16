import { type Metadata } from "next";
import { ComingSoon } from "~/components/ComingSoon";

export const metadata: Metadata = { title: "Manual Entry" };

export default function ManualEntryPage() {
  return <ComingSoon title="Manual Entry" />;
}
