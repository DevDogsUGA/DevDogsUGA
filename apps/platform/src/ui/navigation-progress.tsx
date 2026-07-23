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
  phaseRef.current = phase;
  const doneTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (phaseRef.current === "idle") return;
    setPhase("done");
    clearTimeout(doneTimerRef.current);
    doneTimerRef.current = setTimeout(() => setPhase("idle"), 600);
  }, [pathname]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
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
