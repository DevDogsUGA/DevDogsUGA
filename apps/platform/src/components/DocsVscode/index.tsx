"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  EXTENSION_URL,
  HANDOFF_CHANNEL,
  isHandoffMessage,
  newSession,
  rememberSession,
  currentSession,
  VSCODE_LINK_PREFIX,
  withSession,
} from "./handoff";

/** How long the "Opening VS Code…" popup lasts, fade included (see
 * `.docs-vscode-popup` in globals.css, whose animation this matches). */
const POPUP_MS = 7000;

/** How long "Continued in a newer tab" stays. */
const NOTICE_MS = 6000;

// "Continued in a newer tab" is set just before this tab moves to the next
// step and read by the page it lands on, so it lives outside React.
let continued = false;
const watchers = new Set<() => void>();

function setContinued(value: boolean): void {
  continued = value;
  watchers.forEach((notify) => notify());
}

function subscribeContinued(onChange: () => void): () => void {
  watchers.add(onChange);
  return () => {
    watchers.delete(onChange);
  };
}

interface Popup {
  id: number;
  top: number;
  left: number;
}

/**
 * The "Review in VS Code" links on a docs page: the button at the top of a
 * step and the icon in a code block's bar. The compiler writes them as plain
 * `vscode://devdogsuga.workshops/…` links, so one listener here serves them
 * all (as DocsCodeCopy does for Copy).
 *
 * A click gives this tab a session id, puts it on the link as `session`, and
 * shows a popup for a few seconds. A page can't tell whether a `vscode://`
 * link opened anything, so the popup is the only hint, and only after a
 * click. When the review finishes, the extension opens the next step in a
 * new tab (see DocsHandoff), which tells this tab, matched by session, to
 * move on too.
 */
export default function DocsVscode() {
  const router = useRouter();
  const [popup, setPopup] = useState<Popup | null>(null);
  const showContinued = useSyncExternalStore(
    subscribeContinued,
    () => continued,
    () => false,
  );

  useEffect(() => {
    let count = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function onClick(event: MouseEvent) {
      const link = (event.target as Element | null)?.closest<HTMLAnchorElement>(
        `a[href^="${VSCODE_LINK_PREFIX}"]`,
      );
      if (!link) return;
      // Before the click's default action reads the link's `href`.
      const session = newSession();
      if (session) {
        rememberSession(session);
        link.href = withSession(link.getAttribute("href")!, session);
      }
      const box = link.getBoundingClientRect();
      setPopup({
        id: ++count,
        top: box.bottom + 8,
        left: Math.max(8, Math.min(box.left, window.innerWidth - 280)),
      });
      clearTimeout(timer);
      timer = setTimeout(() => setPopup(null), POPUP_MS);
    }

    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("click", onClick);
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const channel = new BroadcastChannel(HANDOFF_CHANNEL);
    channel.onmessage = (event: MessageEvent<unknown>) => {
      const message = event.data;
      if (!isHandoffMessage(message) || message.session !== currentSession()) {
        return;
      }
      setContinued(true);
      setTimeout(() => setContinued(false), NOTICE_MS);
      router.push(message.path);
    };
    return () => channel.close();
  }, [router]);

  return (
    <>
      {popup && (
        <div
          key={popup.id}
          role="status"
          className="docs-vscode-popup"
          style={{ top: popup.top, left: popup.left }}
        >
          Opening VS Code&hellip; Nothing happened?{" "}
          <a href={EXTENSION_URL} target="_blank" rel="noopener noreferrer">
            Get the extension
          </a>
        </div>
      )}
      {showContinued && (
        <div role="status" className="docs-vscode-notice">
          Continued in a newer tab
        </div>
      )}
    </>
  );
}
