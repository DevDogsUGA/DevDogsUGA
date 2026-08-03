"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Wires up IntersectionObserver for all [data-animate] elements.
 * Elements with [data-animate-stagger] have their [data-animate] children animated
 * in sequentially with an 80ms stagger between each.
 *
 * Registration is driven by a MutationObserver rather than a single pass at
 * mount. That is not belt-and-braces: `[data-animate]` starts at `opacity: 0`
 * in globals.css and only ever becomes visible when this file adds
 * `.is-visible`, so an element this never observes is invisible *permanently*,
 * not merely un-animated.
 *
 * A one-shot `querySelectorAll` made that outcome a race. This component sits
 * in the root layout inside its own <Suspense> (it reads `usePathname`, which
 * Cache Components treats as dynamic), so it hydrates independently of the page
 * body — and under PPR the body arrives as streamed dynamic holes. Anything
 * that landed after this effect ran, or that React re-created afterwards on a
 * route refresh, was never observed and stayed blank. Watching for nodes
 * instead of sampling them once removes the ordering dependency entirely.
 */
export default function AnimationInit() {
  const pathname = usePathname();

  useEffect(() => {
    const STAGGER_MS = 80;
    const OBS_OPTIONS: IntersectionObserverInit = {
      threshold: 0.08,
      rootMargin: "0px 0px -40px 0px",
    };

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      }
    }, OBS_OPTIONS);

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

    // Re-observing an element is a no-op, but tracking what we have already
    // seen keeps the MutationObserver callback cheap on busy subtrees.
    const seen = new WeakSet<Element>();

    function register(el: Element) {
      if (seen.has(el)) return;
      seen.add(el);

      if (el.hasAttribute("data-animate-stagger")) {
        staggerObserver.observe(el);
        return;
      }
      // Children of a stagger container are driven by their parent rather than
      // observed individually.
      if (el.closest("[data-animate-stagger]")) return;
      observer.observe(el);
    }

    function registerTree(root: Element | Document) {
      if (
        root instanceof Element &&
        (root.hasAttribute("data-animate") ||
          root.hasAttribute("data-animate-stagger"))
      ) {
        register(root);
      }
      root
        .querySelectorAll("[data-animate], [data-animate-stagger]")
        .forEach(register);
    }

    registerTree(document);

    const mutations = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            registerTree(node as Element);
          }
        }
      }
    });

    mutations.observe(document.body, { childList: true, subtree: true });

    return () => {
      mutations.disconnect();
      observer.disconnect();
      staggerObserver.disconnect();
    };
  }, [pathname]);

  return null;
}
