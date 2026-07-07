"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import LeaderHoverCard, { type LeaderHoverCardProps } from "./LeaderHoverCard";
import { computeClusterLayout } from "~/app/(navbar)/clusterLayout";

const CONTAINER_W = 920;
const CONTAINER_H = 660;
const CARD_HALF_W = 60;
const CARD_HALF_H = 90;
const POPUP_HALF_FOOTPRINT = (256 + 24) / 2;
const CENTER_THRESHOLD = 50;

function getHoverSide(
  cx: number,
  cy: number,
): "left" | "right" | "top" | "bottom" {
  if (Math.abs(cx) < CENTER_THRESHOLD) {
    return cy < 0 ? "bottom" : cy > 0 ? "top" : "right";
  }
  return cx > 0 ? "left" : "right";
}

interface Props {
  profiles: LeaderHoverCardProps[];
}

export default function LeaderCluster({ profiles }: Props) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [hoverLocked, setHoverLocked] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const prevHoveredRef = useRef<number | null>(null);
  const closingIndexRef = useRef<number | null>(null);
  const settledRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: CONTAINER_W, h: CONTAINER_H });

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
  }, []);

  const scheduleClose = useCallback(() => {
    closeTimerRef.current = setTimeout(() => setHovered(null), 150);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry!.contentRect;
      setDims({ w: Math.round(width), h: Math.round(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // When a card closes, the rest of the cluster animates back into place.
  // Lock new hovers until that settles AND the user moves the mouse again,
  // so the layout shift can't immediately trigger another card to open.
  useEffect(() => {
    if (prevHoveredRef.current !== null && hovered === null) {
      settledRef.current = false;
      closingIndexRef.current = prevHoveredRef.current;
      setHoverLocked(true);
      settleTimerRef.current = setTimeout(() => {
        settledRef.current = true;
      }, 600);
    }
    prevHoveredRef.current = hovered;
  }, [hovered]);

  const handleMouseMove = useCallback(() => {
    if (hoverLocked && settledRef.current) {
      setHoverLocked(false);
    }
  }, [hoverLocked]);

  useEffect(
    () => () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    },
    [],
  );

  const layout = useMemo(
    () => computeClusterLayout(profiles.length, dims.w, dims.h),
    [profiles.length, dims.w, dims.h],
  );

  return (
    <>
      <div className="lg:hidden">
        <div
          className="mx-auto mb-6 grid max-w-3xl grid-cols-1 justify-items-center gap-y-8 sm:grid-cols-2 sm:gap-x-2 sm:gap-y-0"
          data-animate-stagger
        >
          {profiles.slice(0, 2).map((member) => (
            <div key={member.name} data-animate="fade-up">
              <LeaderHoverCard {...member} />
            </div>
          ))}
        </div>
        <div
          className="mt-8 grid grid-cols-2 justify-items-center gap-x-2 gap-y-8 sm:grid-cols-3"
          data-animate-stagger
        >
          {profiles.slice(2).map((member) => (
            <div key={member.name} data-animate="fade-up">
              <LeaderHoverCard {...member} />
            </div>
          ))}
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative mx-auto hidden perspective-[0px] lg:block"
        style={{ width: CONTAINER_W, height: CONTAINER_H }}
        onMouseMove={handleMouseMove}
      >
        {profiles.map((member, i) => {
          const { cx, cy, deg, tx, ty } = layout[i] ?? {
            cx: 0,
            cy: 0,
            deg: 0,
            tx: 0,
            ty: 0,
          };
          const left = dims.w / 2 + cx - CARD_HALF_W;
          const top = dims.h / 2 + cy - CARD_HALF_H;

          const hoverSide = getHoverSide(cx, cy);
          const popupAnimX =
            hoverSide === "left"
              ? +POPUP_HALF_FOOTPRINT
              : hoverSide === "right"
                ? -POPUP_HALF_FOOTPRINT
                : 0;

          let animX = tx;
          let animY = ty;
          let animRotate = deg;
          let animScale = 1;
          let animOpacity = 1;
          let animZ = 1;

          if (hovered !== null && hovered !== i) {
            const hLayout = layout[hovered] ?? { cx: 0, cy: 0 };
            const hoveredSide = getHoverSide(hLayout.cx, hLayout.cy);
            const isVertical =
              hoveredSide === "top" || hoveredSide === "bottom";
            const dx = cx - hLayout.cx;
            const dy = cy - hLayout.cy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const strength = Math.max(0, 1 - dist / 600) * 170;
            if (dist > 0) {
              if (isVertical) {
                const popupDirY = hoveredSide === "bottom" ? 1 : -1;
                const inPath = Math.max(0, (dy * popupDirY) / dist);
                const dirX =
                  (dx / dist) * (1 - inPath) + (cx >= 0 ? 1 : -1) * inPath;
                animX = tx + dirX * strength * (1.0 + inPath * 1.0);
                animY = 0;
              } else {
                animX = tx + (dx / dist) * strength * 1.5;
                animY = ty + (dy / dist) * strength * 0.7;
              }
            }
            animScale = 0.88;
            animOpacity = 0.55;
            animZ = 0;
          } else if (hovered === i) {
            animX = popupAnimX;
            animY = 0;
            animRotate = 0;
            animScale = 1.06;
            animZ = 10;
          }

          return (
            <motion.div
              key={member.name}
              className="absolute"
              style={{ left, top }}
              animate={{
                x: animX,
                y: animY,
                rotate: animRotate,
                scale: animScale,
                opacity: animOpacity,
                zIndex: animZ,
              }}
              transition={{ type: "spring", stiffness: 200, damping: 26 }}
              onAnimationComplete={() => {
                if (closingIndexRef.current === i) {
                  settledRef.current = true;
                  closingIndexRef.current = null;
                  if (settleTimerRef.current)
                    clearTimeout(settleTimerRef.current);
                }
              }}
            >
              <LeaderHoverCard
                {...member}
                hoverSide={hoverSide}
                hoverLocked={hoverLocked}
                onHoverStart={() => {
                  if (hoverLocked) return;
                  cancelClose();
                  setHovered(i);
                }}
                onHoverEnd={scheduleClose}
              />
            </motion.div>
          );
        })}
      </div>
    </>
  );
}
