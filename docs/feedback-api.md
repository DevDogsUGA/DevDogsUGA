# Feedback API

The Feedback API lets users in a sibling DevDogs-UGA project (e.g. the Community Resource Forum) submit bug reports, feature requests, and other feedback into DevDogs' centralized review queue. Submissions are visible on the [DevDogs console](https://devdogsuga.org/console/feedback) and are tagged with the OAuth client that submitted them, so each team sees only their own feedback.

`@devdogsuga/feedback-client` ships both a lightweight SDK for calling the REST API directly and a drop-in `<FeedbackDialog>` React component that gives you a complete, styled feedback form with zero extra dependencies on your end.

## Prerequisites

- An OAuth client registered on the [DevDogs tools page](https://devdogsuga.org/tools/oauth). You'll need your **Client ID**.
- At least one feedback topic configured on the [Feedback API testing page](https://devdogsuga.org/tools/testing/feedback). Topics are the "areas" users can tag their feedback with (e.g. "Homepage", "Search", "Checkout").
- Users must be signed in via **Sign in with DevDogs** so their session token can be forwarded to the API.

## Installation

```bash
pnpm add @devdogsuga/feedback-client
```

## The SDK

### Initializing the client

```ts
import { FeedbackClient } from "@devdogsuga/feedback-client";

const client = new FeedbackClient({
  baseUrl: "https://devdogsuga.org",
  clientId: process.env.NEXT_PUBLIC_DEVDOGS_CLIENT_ID,
});
```

### Fetching topics

Topics are configured per-client on the DevDogs console. Fetch them at runtime to populate a dropdown:

```ts
const { topics } = await client.getTopics();
// ["Homepage", "Search", "Checkout", ...]
```

### Submitting feedback

Pass the user's current DevDogs access token alongside the form values:

```ts
await client.submitFeedback(accessToken, {
  type: "bug_report", // "bug_report" | "feature_request" | "design_feedback" | "performance" | "content_issue" | "other"
  topic: "Search", // must match a configured topic label
  severity: "medium", // "low" | "medium" | "high" — only meaningful for bug_report
  title: "Results disappear on mobile",
  description:
    "When I tap the search bar on iOS Safari, the result list collapses immediately.",
  browserMetadata: {
    // optional — collect with navigator/screen/window
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    screenWidth: screen.width,
    screenHeight: screen.height,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    url: window.location.href,
  },
});
```

`submitFeedback` throws if the server returns a non-2xx status.

## The `<FeedbackDialog>` component

The package ships a ready-to-render React dialog that handles field rendering, validation, topic-fetching, browser-metadata collection, error display, and success state — built on `@radix-ui/react-dialog`.

### Basic setup

Import the stylesheet once in your app (e.g. in your root layout or `globals.css`):

```ts
import "@devdogsuga/feedback-client/react/styles.css";
```

Then render the dialog wherever you want to trigger it:

```tsx
import { useState } from "react";
import { FeedbackClient } from "@devdogsuga/feedback-client";
import { FeedbackDialog } from "@devdogsuga/feedback-client/react";

const client = new FeedbackClient({
  baseUrl: "https://devdogsuga.org",
  clientId: process.env.NEXT_PUBLIC_DEVDOGS_CLIENT_ID,
});

export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Send Feedback</button>
      <FeedbackDialog
        open={open}
        onOpenChange={setOpen}
        client={client}
        getAccessToken={async () => {
          const { data } = await supabase.auth.getSession();
          return data.session?.access_token ?? "";
        }}
      />
    </>
  );
}
```

When `topics` is not provided, the dialog fetches them automatically via `client.getTopics()` when it first opens.

### Props

| Prop                     | Type                                            | Default             | Description                                                                  |
| ------------------------ | ----------------------------------------------- | ------------------- | ---------------------------------------------------------------------------- |
| `open`                   | `boolean`                                       | —                   | Controlled open state.                                                       |
| `onOpenChange`           | `(open: boolean) => void`                       | —                   | Called when the dialog requests a state change.                              |
| `title`                  | `string`                                        | `"Submit Feedback"` | Dialog heading.                                                              |
| `topics`                 | `string[]`                                      | —                   | Static topic list. If omitted, fetched from the API via `client`.            |
| `client`                 | `FeedbackClient`                                | —                   | SDK instance. Required for the default submit/fetch transport.               |
| `getAccessToken`         | `() => Promise<string>`                         | —                   | Returns the user's current DevDogs access token. Required with `client`.     |
| `onSubmit`               | `(values: FeedbackFormValues) => Promise<void>` | —                   | Overrides the default submit transport (e.g. to call a server action).       |
| `collectBrowserMetadata` | `boolean`                                       | `true`              | Collect and include `navigator`/`screen`/`window` metadata with submissions. |
| `theme`                  | `Partial<FeedbackDialogTheme>`                  | —                   | CSS custom-property overrides (see [Theming](#theming)).                     |
| `classNames`             | `Partial<Record<FeedbackDialogPart, string>>`   | —                   | Additional class names applied to individual parts.                          |

### Theming

The component is styled via CSS custom properties defined on a `.feedback-dialog` root element. The `theme` prop lets you override any of them without touching CSS:

```tsx
<FeedbackDialog
  theme={{
    background: "#1e1e2e",
    foreground: "#cdd6f4",
    muted: "#6c7086",
    border: "#45475a",
    accent: "#89b4fa",
    accentForeground: "#1e1e2e",
    radius: "0.5rem",
    fontFamily: "inherit",
  }}
  // ...
/>
```

Available theme keys:

| Key                | Default         | Description                                        |
| ------------------ | --------------- | -------------------------------------------------- |
| `background`       | `#ffffff`       | Dialog surface color.                              |
| `foreground`       | `#0f172a`       | Primary text color.                                |
| `muted`            | `#64748b`       | Secondary/placeholder text color.                  |
| `border`           | `#cbd5e1`       | Input and container border color.                  |
| `accent`           | `#06b6d4`       | Submit button and focus-ring color.                |
| `accentForeground` | `#083344`       | Text on top of `accent`.                           |
| `radius`           | `0.5rem`        | Border radius applied to the container and inputs. |
| `fontFamily`       | system-ui stack | Font applied to the dialog root.                   |

### Per-part class names

Use `classNames` to append additional classes to individual parts — useful for targeting elements with your own CSS or utility framework:

```tsx
<FeedbackDialog
  classNames={{
    content: "my-dialog-override",
    submitButton: "my-submit-btn",
  }}
/>
```

Available parts: `overlay`, `content`, `header`, `title`, `closeButton`, `body`, `field`, `label`, `select`, `input`, `textarea`, `hint`, `error`, `banner`, `success`, `footer`, `cancelButton`, `submitButton`.

### Custom submit handler

To submit via a server action instead of the public REST API, pass `onSubmit`:

```tsx
import { submitFeedback } from "~/server/actions/feedback";

<FeedbackDialog
  topics={["Homepage", "Dashboard", "Settings"]}
  onSubmit={async (values) => {
    const fd = new FormData();
    fd.set("type", values.type);
    fd.set("topic", values.topic);
    if (values.severity) fd.set("severity", values.severity);
    fd.set("title", values.title);
    fd.set("description", values.description);
    if (values.browserMetadata) {
      fd.set("browserMetadata", JSON.stringify(values.browserMetadata));
    }
    await submitFeedback(fd);
  }}
/>;
```

## REST API

For non-React integrations or when you want full control over the HTTP layer.

### `GET /api/feedback/[clientId]/topics`

Returns the topic labels configured for the given client. No authentication required.

**Response:**

```json
{ "topics": ["Homepage", "Search", "Checkout"] }
```

Returns `404` if the `clientId` is not registered.

### `POST /api/feedback/[clientId]`

Submits a new feedback entry. Requires a valid DevDogs Bearer token in the `Authorization` header.

**Request body (JSON):**

```json
{
  "type": "bug_report",
  "topic": "Search",
  "severity": "medium",
  "title": "Results disappear on mobile",
  "description": "When I tap the search bar on iOS Safari...",
  "browserMetadata": {
    "userAgent": "Mozilla/5.0 ...",
    "platform": "iPhone",
    "screenWidth": 390,
    "screenHeight": 844,
    "viewportWidth": 390,
    "viewportHeight": 664,
    "url": "https://myapp.com/search"
  }
}
```

All fields except `severity` and `browserMetadata` are required. `severity` is only meaningful when `type` is `"bug_report"`. Returns `201` with `{ "id": "<feedback-id>" }` on success.

## Testing

The [Feedback API testing page](https://devdogsuga.org/tools/testing/feedback) in the DevDogs console gives you:

- Your **Client ID** and a **topics editor** to configure your topic list.
- A **test feedback list** showing submissions made by your test accounts, so you can verify the full flow end-to-end before going live.

To test submissions, create test accounts on the [Test Accounts page](https://devdogsuga.org/tools/testing/accounts), sign in as one of them in your app (via Sign in with DevDogs), and submit feedback. The submission will appear in the test list immediately — it does not go into the main review queue until the submitting account is promoted from test to real.

## Implementation notes

### CSS custom properties for theming

Rather than shipping Tailwind classes or requiring a specific CSS framework, the component defines all visual properties as `--fd-*` CSS custom properties on a `.feedback-dialog` root class. The `theme` prop translates its keys to matching `--fd-*` inline styles on that same element, so the values cascade to every child without specificity conflicts. The shipped `styles.css` provides light-theme defaults; any prop in `theme` overrides exactly one variable.

This means you can also override styles with plain CSS by targeting `.feedback-dialog` or its BEM-style part classes (`.feedback-dialog__submit`, `.feedback-dialog__content`, etc.) — no JavaScript required.

### `nodenext` module resolution

`packages/feedback-client` is compiled with `module: nodenext` and `moduleResolution: nodenext`. Relative imports inside the package source use `.js` extensions even though the files are `.ts` — this is required by Node's ESM resolver and is the compile-time convention for TypeScript under this setting.

### Why `onSubmit` instead of a direct API call on the DevDogs site

The DevDogs site submits feedback via a Next.js server action (`submitFeedback`) rather than calling `POST /api/feedback/[clientId]`. This avoids an unnecessary HTTP round-trip (server action → own API → database) and lets the action participate in DevDogs' existing auth/validation stack (`expectSession`, `zfd` form schema, Drizzle insert) without duplicating logic. The `onSubmit` prop exists precisely to support this pattern: the portable component handles all UI, and the host supplies the transport.

### `browserMetadata` collection

When `collectBrowserMetadata` is `true` (the default), the component reads `navigator.userAgent`, `navigator.platform`, `screen.width/height`, `window.innerWidth/innerHeight`, and `window.location.href` at the moment of submission — not at open time. This captures the viewport dimensions and URL as they were when the user clicked Submit, which is the most useful snapshot for debugging layout or navigation bugs. The data is stored in the `siteFeedback.browserMetadata` JSONB column and is visible in the feedback detail view on the console.
