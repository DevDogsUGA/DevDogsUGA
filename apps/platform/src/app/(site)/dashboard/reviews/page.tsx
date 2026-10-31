import type { Metadata } from "next";
import { connection } from "next/server";
import "~/components/Console/console.css";
import ReportCard from "~/components/Projects/ReportCard";
import ReviewForm from "~/components/Projects/ReviewForm";
import "~/components/Projects/projects.css";
import { requireAccess, rules } from "~/server/auth/access";
import { getReviewQueue } from "~/server/projects/load";
import { PageHeading, Panel } from "~/ui/app-shell";
import { EmptyState } from "~/ui/empty-state";

export const metadata: Metadata = {
  title: "Review queue | DevDogs",
  robots: { index: false },
};

/**
 * Every EL report waiting for review, with the commits each one cites. It is
 * for holders of the report-review permission; a project's advisor reviews its
 * reports from the project page. Nobody sees their own report here: they
 * cannot review it.
 */
export default async function ReviewQueuePage() {
  await connection();
  const caller = await requireAccess(rules.reviewProjectReports);
  const queue = await getReviewQueue(caller.userId, { all: true });

  return (
    <div className="con">
      <PageHeading
        title="Review queue"
        description="Read each report and the commits behind it, then approve it, adjusting the hours if needed, or return it with a note. Every decision is written to the audit log."
      />
      <Panel
        id="reports"
        title="Reports to review"
        help="Hours already credited to a workshop do not count again; adjust the hours if a report claims them."
      >
        {queue.length === 0 ? (
          <EmptyState title="Nothing waiting for review" />
        ) : (
          <ul className="prj-list">
            {queue.map((report) => (
              <ReportCard key={report.id} report={report} showAuthor>
                <ReviewForm reportId={report.id} claimedHours={report.hours} />
              </ReportCard>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
