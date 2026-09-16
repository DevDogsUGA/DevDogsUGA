import { type Metadata } from "next";
import { ComingSoon } from "~/components/ComingSoon";

export const metadata: Metadata = { title: "Past Credits" };

export default function PastCreditsPage() {
  return <ComingSoon title="Past Credits" />;
}
