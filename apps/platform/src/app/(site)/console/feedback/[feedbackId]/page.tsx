import Link from "next/link";
import AccentBlobs from "~/ui/accent-blobs";
import ConsoleTitle from "~/ui/page-title";
import FeedbackAdminNoteForm from "~/components/FeedbackAdminNoteForm";
import FeedbackStatusSelect, {
  type FeedbackStatus,
} from "~/components/FeedbackStatusSelect";
import {
  getFeedbackDetail,
  updateFeedbackStatus,
} from "~/server/actions/feedback";

function formatLabel(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const SEVERITY_CLASSES: Record<string, string> = {
  low: "bg-white/10 text-mauve-300",
  medium: "bg-amber-500/10 text-amber-300",
  high: "bg-rose-500/10 text-rose-300",
};

function Chip({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`rounded-sm px-2 py-0.5 text-xs ${className || "bg-white/10 text-mauve-300"}`}
    >
      {children}
    </span>
  );
}

export default async function FeedbackDetailPage({
  params,
}: {
  params: Promise<{ feedbackId: string }>;
}) {
  const { feedbackId } = await params;
  const feedback = await getFeedbackDetail(feedbackId);

  return (
    <>
      <ConsoleTitle>
        <h2 className="text-base/none font-semibold text-white">
          <Link
            href="/console/feedback"
            className="text-mauve-400 transition-colors hover:text-white"
          >
            Feedback
          </Link>
          <span className="mx-2 text-mauve-600">/</span>
          <span className="font-mono text-sm">{feedbackId}</span>
        </h2>
      </ConsoleTitle>

      <div className="relative isolate mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 @sm:px-6">
        <AccentBlobs accent="amber" />

        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-mauve-400">
            {new Date(feedback.createdAt).toLocaleString()} ·{" "}
            {feedback.submitterName}
          </p>
          <FeedbackStatusSelect
            feedbackId={feedback.id}
            status={feedback.status as FeedbackStatus}
            updateStatus={updateFeedbackStatus}
          />
        </div>

        {/* Content */}
        <section className="relative rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <Chip>{formatLabel(feedback.type)}</Chip>
            {feedback.severity && (
              <Chip className={SEVERITY_CLASSES[feedback.severity]}>
                {formatLabel(feedback.severity)}
              </Chip>
            )}
            {feedback.topicLabel && <Chip>{feedback.topicLabel}</Chip>}
          </div>
          <h2 className="mb-2 font-semibold text-white">{feedback.title}</h2>
          <p className="text-sm whitespace-pre-wrap text-mauve-200">
            {feedback.description}
          </p>
        </section>

        {/* Submitter */}
        <section className="rounded-xl border border-white/10 bg-white/5 p-4">
          <h2 className="mb-1 text-xs font-semibold tracking-wide text-mauve-400 uppercase">
            Submitted by
          </h2>
          <p className="font-medium text-white">{feedback.submitterName}</p>
          <p className="font-mono text-xs text-mauve-400">
            {feedback.submitterUserId}
          </p>
        </section>

        {/* Attachments */}
        {feedback.attachmentSignedUrls.length > 0 && (
          <section className="rounded-xl border border-white/10 bg-white/5 p-4">
            <h2 className="mb-2 font-semibold text-white">Attachments</h2>
            <ul className="flex flex-col gap-1">
              {feedback.attachmentSignedUrls.map((attachment) => (
                <li key={attachment.path}>
                  <a
                    href={attachment.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-400 hover:text-blue-300"
                  >
                    {attachment.path.split("/").pop()}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Browser metadata */}
        {feedback.browserMetadata && (
          <section className="rounded-xl border border-white/10 bg-white/5 p-4">
            <h2 className="mb-2 font-semibold text-white">Browser Metadata</h2>
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <div className="col-span-2 sm:col-span-3">
                <dt className="text-xs text-mauve-400">User Agent</dt>
                <dd className="truncate text-white/80">
                  {feedback.browserMetadata.userAgent}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-mauve-400">Platform</dt>
                <dd className="text-white/80">
                  {feedback.browserMetadata.platform}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-mauve-400">Screen</dt>
                <dd className="text-white/80">
                  {feedback.browserMetadata.screenWidth}×
                  {feedback.browserMetadata.screenHeight}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-mauve-400">Viewport</dt>
                <dd className="text-white/80">
                  {feedback.browserMetadata.viewportWidth}×
                  {feedback.browserMetadata.viewportHeight}
                </dd>
              </div>
              <div className="col-span-2 sm:col-span-3">
                <dt className="text-xs text-mauve-400">URL</dt>
                <dd className="truncate text-white/80">
                  {feedback.browserMetadata.url}
                </dd>
              </div>
            </dl>
          </section>
        )}

        {/* Admin note */}
        <section className="rounded-xl border border-white/10 bg-white/5 p-4">
          <h2 className="mb-2 font-semibold text-white">Admin Note</h2>
          <FeedbackAdminNoteForm
            feedbackId={feedback.id}
            adminNote={feedback.adminNote}
          />
        </section>
      </div>
    </>
  );
}
