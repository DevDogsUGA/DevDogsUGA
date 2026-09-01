"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { wasNavigationBlocked } from "~/lib/navigationGuard";

type Phase = "idle" | "loading" | "done";

export default function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const [phase, setPhase] = useState<Phase>("idle");
  const [animKey, setAnimKey] = useState(0);
  const phaseRef = useRef<Phase>("idle");
  const doneTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(
    () => () => {
      clearTimeout(doneTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (phaseRef.current === "idle") return;
    phaseRef.current = "done";
    setPhase("done");
    clearTimeout(doneTimerRef.current);
    doneTimerRef.current = setTimeout(() => {
      phaseRef.current = "idle";
      setPhase("idle");
    }, 600);
  }, [pathname, search]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      // `defaultPrevented` cannot identify a cancelled navigation: Next sets it
      // on every `<Link>` click it handles. The unsaved-changes guard marks the
      // original event explicitly before cancelling it instead.
      if (wasNavigationBlocked(e)) return;
      if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) {
        return;
      }
      if (!(e.target instanceof Element)) return;
      const a = e.target.closest("a[href]");
      if (
        !(a instanceof HTMLAnchorElement) ||
        a.hasAttribute("download") ||
        a.getAttribute("target")
      ) {
        return;
      }
      try {
        const url = new URL(a.href, location.href);
        if (url.origin !== location.origin) return;
        if (
          url.pathname === location.pathname &&
          url.search === location.search
        ) {
          return;
        }
      } catch {
        return;
      }
      clearTimeout(doneTimerRef.current);
      setAnimKey((k) => k + 1);
      phaseRef.current = "loading";
      setPhase("loading");
    }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  if (phase === "idle") return null;

  return (
    <div
      data-slot="navigation-progress"
      data-phase={phase}
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
