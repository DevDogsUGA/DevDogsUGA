/**
 * The slot's resting state — no dialog — for every URL under /events except the
 * intercepted one, and for hard loads, where Next cannot recover what the slot
 * was showing and falls back to this.
 */
export default function Default() {
  return null;
}
