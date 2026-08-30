"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";

type Phase = "idle" | "loading" | "done";

export default function NavigationProgress() {
  const pathname = usePathname();
  const [phase, setPhase] = useState<Phase>("idle");
  const [animKey, setAnimKey] = useState(0);
  const phaseRef = useRef<Phase>("idle");
  const doneTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Mirror the latest phase into a ref (after commit) so the pathname effect can
  // read it without taking `phase` as a dependency.
  useEffect(() => {
    phaseRef.current = phase;
  });

  useEffect(() => {
    if (phaseRef.current === "idle") return;
    setPhase("done");
    clearTimeout(doneTimerRef.current);
    doneTimerRef.current = setTimeout(() => setPhase("idle"), 600);
  }, [pathname]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      // Someone ahead of us already cancelled this navigation, so there is no
      // page load to report. This listener is on the bubble phase, so anything
      // that ran in capture, such as the account page's unsaved-changes guard
      // (see ~/ui/settings-form), has already had its say by now.
      //
      // Without this the bar starts a load that will never finish: it only
      // clears when `pathname` changes, and a cancelled click never changes it,
      // so it creeps to 85% and sits there for the rest of the session.
      if (e.defaultPrevented) return;
      if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const a = (e.target as Element).closest("a");
      if (!a?.getAttribute("href") || a.getAttribute("target")) return;
      try {
        const url = new URL(a.href, location.href);
        if (url.origin !== location.origin) return;
        if (url.pathname === location.pathname && !url.search) return;
      } catch {
        return;
      }
      clearTimeout(doneTimerRef.current);
      setAnimKey((k) => k + 1);
      setPhase("loading");
    }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  if (phase === "idle") return null;

  return (
    <div
      data-slot="navigation-progress"
      className="pointer-events-none fixed top-0 right-0 left-0 z-[9999] h-[2px]"
      aria-hidden="true"
    >
      <motion.div
        key={animKey}
        className="h-full bg-gradient-to-r from-amber-400 to-rose-500"
        style={{ transformOrigin: "0% 50%" }}
        initial={{ scaleX: 0, opacity: 1 }}
        animate={
          phase === "done" ? { scaleX: 1, opacity: 0 } : { scaleX: 0.85 }
        }
        transition={
          phase === "done"
            ? {
                scaleX: { duration: 0.15, ease: "easeOut" },
                opacity: { duration: 0.25, delay: 0.1 },
              }
            : { scaleX: { duration: 12, ease: [0.05, 0.5, 0.8, 0.95] } }
        }
      />
    </div>
  );
}
