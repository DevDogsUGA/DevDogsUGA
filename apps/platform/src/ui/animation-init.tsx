"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Wires up IntersectionObserver for all [data-animate] elements.
 * Re-runs on navigation so elements added by the incoming page are observed.
 * Elements with [data-animate-stagger] have their [data-animate] children animated
 * in sequentially with an 80ms stagger between each.
 */
export default function AnimationInit() {
  const pathname = usePathname();

  useEffect(() => {
    const STAGGER_MS = 80;
    const OBS_OPTIONS: IntersectionObserverInit = {
      threshold: 0.08,
      rootMargin: "0px 0px -40px 0px",
    };

    // Regular elements NOT inside a stagger container
    const regularElements = Array.from(
      document.querySelectorAll<HTMLElement>("[data-animate]"),
    ).filter((el) => !el.closest("[data-animate-stagger]"));

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      }
    }, OBS_OPTIONS);

    regularElements.forEach((el) => observer.observe(el));

    // Stagger containers — add children in sequence
    const staggerParents = Array.from(
      document.querySelectorAll<HTMLElement>("[data-animate-stagger]"),
    );

    const staggerObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const children = Array.from(
            entry.target.querySelectorAll<HTMLElement>("[data-animate]"),
          );
          children.forEach((child, i) => {
            child.style.transitionDelay = `${i * STAGGER_MS}ms`;
            requestAnimationFrame(() => child.classList.add("is-visible"));
          });
          staggerObserver.unobserve(entry.target);
        }
      }
    }, OBS_OPTIONS);

    staggerParents.forEach((el) => staggerObserver.observe(el));

    return () => {
      observer.disconnect();
      staggerObserver.disconnect();
    };
  }, [pathname]);

  return null;
}
