import { type Metadata } from "next";
import { ComingSoon } from "~/components/ComingSoon";

export const metadata: Metadata = { title: "Questionnaire" };

export default function QuestionnairePage() {
  return <ComingSoon title="Questionnaire" />;
}
