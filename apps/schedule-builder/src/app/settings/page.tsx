import { type Metadata } from "next";
import { ComingSoon } from "~/components/ComingSoon";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return <ComingSoon title="Settings" />;
}
