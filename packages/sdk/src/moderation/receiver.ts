/**
 * The reference receiver: the contract an app's `platform-moderation` endpoint
 * has to honour, written once as small pure pieces plus an in-memory store.
 *
 * An app implements the same three rules in its own database (DogPack does it
 * in `moderation.apply_event`, behind a Supabase Edge Function):
 *
 * 1. **Signed.** The body is authenticated by the Standard Webhooks headers
 *    and the client's secret. An unsigned or mis-signed request is refused
 *    with 401 and changes nothing.
 * 2. **Idempotent.** A message id is applied at most once. A replay is
 *    acknowledged (2xx, so the platform stops retrying) and ignored.
 * 3. **Order-safe.** A message older than the last decision applied to the
 *    same item is acknowledged and ignored, so a late retry cannot undo a
 *    newer decision.
 *
 * Everything that is not "applied" still answers 2xx. Only a refusal the
 * sender can fix (bad signature, unreadable body) is a 4xx, and a failure
 * worth retrying is a 5xx.
 */
import {
  itemKey,
  isContentMessage,
  parseMessage,
  type ModerationMessage,
} from "./messages.js";
import {
  verifyMessage,
  type HeaderSource,
  type VerifyOptions,
} from "./signing.js";

export type Outcome = "applied" | "duplicate" | "stale";

export interface ModerationStore {
  /** Records the message id. Returns false when it was already recorded. */
  recordMessage(id: string): Promise<boolean> | boolean;
  /** Epoch milliseconds of the last decision applied to the item, if any. */
  lastDecision(key: string): Promise<number | null> | number | null;
  /** Applies the change and records `decidedAt` for the item. */
  apply(message: ModerationMessage, decidedAt: number): Promise<void> | void;
}

/**
 * The idempotency and ordering rules, store-agnostic. The id is recorded
 * before the ordering check, so a stale message that is replayed is a
 * duplicate, not stale twice.
 *
 * The three store calls must run in ONE transaction in a database-backed
 * port (DogPack's `moderation.apply_event` is a single SQL function). Recorded
 * and then failing to apply, outside a transaction, would make the platform's
 * retry a "duplicate" and lose the decision for good: if `apply` throws, the
 * recorded id has to roll back with it. The in-memory store below cannot fail
 * halfway, so it does not need to.
 */
export async function applyModerationEvent(
  store: ModerationStore,
  id: string,
  message: ModerationMessage,
): Promise<Outcome> {
  if (!(await store.recordMessage(id))) return "duplicate";
  const decidedAt = Date.parse(message.timestamp);
  const last = await store.lastDecision(itemKey(message));
  if (last !== null && decidedAt < last) return "stale";
  await store.apply(message, decidedAt);
  return "applied";
}

export type ContentState = "visible" | "hidden" | "removed";
export type UserState = "active" | "suspended" | "banned" | "deleted";

export interface MemoryStore extends ModerationStore {
  readonly content: ReadonlyMap<string, ContentState>;
  readonly users: ReadonlyMap<string, UserState>;
  /** Every message that was actually applied, in order. */
  readonly applied: readonly ModerationMessage[];
}

/** The reference store: a few maps. Content absent from `content` is visible. */
export function createMemoryStore(): MemoryStore {
  const seen = new Set<string>();
  const decisions = new Map<string, number>();
  const content = new Map<string, ContentState>();
  const users = new Map<string, UserState>();
  const applied: ModerationMessage[] = [];

  return {
    content,
    users,
    applied,
    recordMessage(id) {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    },
    lastDecision: (key) => decisions.get(key) ?? null,
    apply(message, decidedAt) {
      decisions.set(itemKey(message), decidedAt);
      applied.push(message);
      if (isContentMessage(message)) {
        const key = `${message.data.contentType}:${message.data.contentRef}`;
        content.set(
          key,
          message.type === "content.hide"
            ? "hidden"
            : message.type === "content.remove"
              ? "removed"
              : "visible",
        );
      } else {
        users.set(
          message.data.userId,
          message.type === "user.suspend"
            ? "suspended"
            : message.type === "user.ban"
              ? "banned"
              : message.type === "user.delete"
                ? "deleted"
                : "active",
        );
      }
    },
  };
}

export interface ReceiverResponse {
  status: 200 | 400 | 401;
  outcome?: Outcome;
  error?:
    | "missing_headers"
    | "bad_timestamp"
    | "expired"
    | "bad_signature"
    | "invalid_body";
}

export interface Receiver {
  handle(headers: HeaderSource, body: string): Promise<ReceiverResponse>;
  /** The same thing as a fetch handler, for an Edge Function or a Worker. */
  fetch(request: Request): Promise<Response>;
}

export interface ReceiverOptions {
  /** One secret, or several while a rotation is in flight. */
  secret: string | readonly string[];
  store: ModerationStore;
  verify?: VerifyOptions;
}

export function createReceiver(options: ReceiverOptions): Receiver {
  async function handle(
    headers: HeaderSource,
    body: string,
  ): Promise<ReceiverResponse> {
    const verified = await verifyMessage(
      options.secret,
      headers,
      body,
      options.verify,
    );
    if (!verified.ok) return { status: 401, error: verified.reason };

    const message = parseMessage(body);
    if (!message) return { status: 400, error: "invalid_body" };

    const outcome = await applyModerationEvent(
      options.store,
      verified.id,
      message,
    );
    return { status: 200, outcome };
  }

  return {
    handle,
    async fetch(request) {
      if (request.method !== "POST") {
        return new Response(null, { status: 405 });
      }
      const result = await handle(request.headers, await request.text());
      return Response.json(result, { status: result.status });
    },
  };
}
