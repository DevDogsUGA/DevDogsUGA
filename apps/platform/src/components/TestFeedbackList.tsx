import FeedbackRow from "~/components/FeedbackRow";
import type { FeedbackListItem } from "~/server/actions/feedback";
import { updateTestFeedbackStatus } from "~/server/actions/feedback";

interface Props {
  items: FeedbackListItem[];
}

export default function TestFeedbackList({ items }: Props) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-mauve-400">No test feedback submitted yet.</p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <FeedbackRow
          key={item.id}
          item={item}
          updateStatus={updateTestFeedbackStatus}
        />
      ))}
    </ul>
  );
}
