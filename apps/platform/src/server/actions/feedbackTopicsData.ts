/**
 * Shared feedback topic constants used by `feedback.ts`, `feedbackTopics.ts`,
 * and the Feedback API test page. Pulled into their own module because
 * "use server" files may only export async functions — these can't live (as
 * exports) alongside the server actions that use them.
 */

/**
 * Topics for feedback submitted on the primary DevDogs website itself
 * (via `FeedbackDialog`/`submitFeedback`), validated against this fixed list
 * rather than a client's `feedbackTopics` rows.
 */
export const DEVDOGS_WEBSITE_FEEDBACK_TOPICS = [
  "homepage",
  "events",
  "projects",
  "community",
  "console",
  "oauth",
  "docs",
  "navigation",
  "other",
] as const;

/**
 * One-click starter topic lists for known DevDogs applications, offered on
 * the Feedback API test page. Developers can add/remove topics afterward.
 */
export const FEEDBACK_TOPIC_TEMPLATES = {
  devdogs_website: {
    label: "DevDogs Website",
    topics: DEVDOGS_WEBSITE_FEEDBACK_TOPICS,
  },
  community_resource_forum: {
    label: "Community Resource Forum",
    topics: [
      "Resource Listings",
      "Search & Filtering",
      "Submissions",
      "Comments & Discussion",
      "Categories & Tags",
      "Notifications",
      "Account & Profile",
      "Other",
    ],
  },
  optimal_schedule_builder: {
    label: "Optimal Schedule Builder",
    topics: [
      "Course Search",
      "Schedule Generation",
      "Section Conflicts",
      "Saved Schedules",
      "Calendar Export",
      "Professor Ratings",
      "Account & Profile",
      "Other",
    ],
  },
  study_group_finder: {
    label: "Study Group Finder",
    topics: [
      "Group Discovery",
      "Group Creation",
      "Messaging",
      "Scheduling & Availability",
      "Notifications",
      "Account & Profile",
      "Other",
    ],
  },
} as const;
