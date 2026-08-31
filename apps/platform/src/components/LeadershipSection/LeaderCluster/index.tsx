"use client";

import { Fragment, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Dialog, DialogContent, DialogTitle } from "~/ui/dialog";
import { computeClusterLayout, type CardLayout } from "./clusterLayout";
import {
  CARD_H,
  CARD_W,
  CONTAINER_H,
  CONTAINER_W,
  hitTest,
  holdsPointer,
  openRegion,
  openShiftX,
  popupPlacement,
  popupSideFor,
  repelOffset,
  type Point,
  type PopupSide,
} from "./geometry";
import { formatLeaderMeta, type LeaderProfile } from "./profile";
import Headshot from "./Headshot";
import LeaderDetails from "./LeaderDetails";
import LeaderTile from "./LeaderTile";

interface Props {
  profiles: LeaderProfile[];
}

const SPRING = { type: "spring", stiffness: 200, damping: 26 } as const;

/** Entrance fold per side: the popup swings open from its anchored edge. */
const FOLD: Record<PopupSide, { rotateX?: number; rotateY?: number }> = {
  right: { rotateY: -20 },
  left: { rotateY: 20 },
  bottom: { rotateX: 20 },
  top: { rotateX: -20 },
};

interface PopupProps {
  profile: LeaderProfile;
  layout: CardLayout;
  reduceMotion: boolean;
  popupRef: (el: HTMLDivElement | null) => void;
}

function LeaderPopup({ profile, layout, reduceMotion, popupRef }: PopupProps) {
  const side = popupSideFor(layout);
  const place = popupPlacement(layout, reduceMotion ? 0 : openShiftX(side));
  const fold = reduceMotion ? {} : FOLD[side];
  const meta = formatLeaderMeta(profile.pronouns, profile.year);

  return (
    <motion.div
      ref={popupRef}
      className="shadow-block-md absolute z-30 flex w-64 flex-col gap-3 rounded-sm border-2 border-mauve-900 bg-amber-50 p-4 shadow-black"
      style={{
        left: place.left,
        top: place.top,
        x: place.x,
        y: place.y,
        transformPerspective: 800,
        transformOrigin: place.transformOrigin,
      }}
      initial={{ opacity: 0, ...fold }}
      animate={{ opacity: 1, rotateX: 0, rotateY: 0 }}
      exit={{
        opacity: 0,
        ...fold,
        transition: { duration: 0.18, ease: "easeIn" },
      }}
      transition={{ duration: 0.18, ease: "easeOut" }}
    >
      {meta && <p className="text-xs text-mauve-500">{meta}</p>}
      <LeaderDetails profile={profile} />
    </motion.div>
  );
}

// A type alias, not an interface: motion's `animate` prop type wants the
// implicit index signature only aliases carry.
type CardTarget = {
  x: number;
  y: number;
  rotate: number;
  scale: number;
  opacity: number;
};

/**
 * The spread-out-on-hover cluster.
 *
 * All hover state lives in one `open` index, driven by hit-testing the
 * pointer against the resting layout in `./geometry` — never by mouseenter
 * on the cards, which move. An open card holds the pointer while it stays
 * inside the card + popup region, which is what lets the mouse cross the gap
 * into the popup with no close timers, hover locks, or invisible bridge
 * elements. Keyboard gets the same states: focusing a tile opens it, its
 * popup is next in tab order, Escape or focus leaving the cluster closes.
 */
function DesktopCluster({ profiles }: Props) {
  const [open, setOpen] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const reduceMotion = useReducedMotion() ?? false;

  const layout = useMemo(
    () => computeClusterLayout(profiles.length),
    [profiles.length],
  );
  const openLayout = open === null ? undefined : layout[open];

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const box = containerRef.current?.getBoundingClientRect();
    if (!box) return;
    const p: Point = { x: e.clientX - box.left, y: e.clientY - box.top };

    if (openLayout) {
      const shift = reduceMotion ? 0 : openShiftX(popupSideFor(openLayout));
      if (holdsPointer(openRegion(openLayout, shift), p)) return;
      const popupEl = popupRef.current;
      if (popupEl) {
        const r = popupEl.getBoundingClientRect();
        const popupRegion = {
          left: r.left - box.left,
          top: r.top - box.top,
          right: r.right - box.left,
          bottom: r.bottom - box.top,
        };
        if (holdsPointer(popupRegion, p)) return;
      }
    }

    setOpen(hitTest(layout, p));
  }

  return (
    <div
      ref={containerRef}
      className="relative mx-auto hidden lg:block"
      style={{ width: CONTAINER_W, height: CONTAINER_H }}
      onPointerMove={handlePointerMove}
      onPointerLeave={() => setOpen(null)}
      onBlurCapture={(e) => {
        const next = e.relatedTarget;
        if (!(next instanceof Node) || !containerRef.current?.contains(next)) {
          setOpen(null);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(null);
      }}
    >
      {profiles.map((member, i) => {
        const l = layout[i];
        if (!l) return null;
        const isOpen = open === i;

        let target: CardTarget;
        if (isOpen) {
          target = {
            x: reduceMotion ? 0 : openShiftX(popupSideFor(l)),
            y: 0,
            rotate: 0,
            scale: reduceMotion ? 1 : 1.06,
            opacity: 1,
          };
        } else if (openLayout) {
          const off = reduceMotion
            ? { x: l.tx, y: l.ty }
            : repelOffset(l, openLayout);
          target = {
            ...off,
            rotate: l.deg,
            scale: reduceMotion ? 1 : 0.88,
            opacity: 0.55,
          };
        } else {
          target = { x: l.tx, y: l.ty, rotate: l.deg, scale: 1, opacity: 1 };
        }

        return (
          <Fragment key={member.slug}>
            <motion.div
              className="absolute"
              style={{
                left: CONTAINER_W / 2 + l.cx - CARD_W / 2,
                top: CONTAINER_H / 2 + l.cy - CARD_H / 2,
                zIndex: isOpen ? 20 : 0,
              }}
              initial={false}
              animate={target}
              transition={SPRING}
            >
              <LeaderTile
                profile={member}
                aria-expanded={isOpen}
                onFocus={() => setOpen(i)}
              />
            </motion.div>
            {/* Sibling of its own card rather than appended after the whole
                cluster, so tabbing off an open tile reaches the popup's links
                before the next tile takes the popup over. */}
            <AnimatePresence>
              {isOpen && (
                <LeaderPopup
                  key={member.slug}
                  profile={member}
                  layout={l}
                  reduceMotion={reduceMotion}
                  popupRef={(el) => {
                    if (el) popupRef.current = el;
                  }}
                />
              )}
            </AnimatePresence>
          </Fragment>
        );
      })}
    </div>
  );
}

/** One grid tile plus the bottom sheet it opens. Grid mode has no hover. */
function GridLeader({ profile }: { profile: LeaderProfile }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const meta = formatLeaderMeta(profile.pronouns, profile.year);

  return (
    <>
      <LeaderTile profile={profile} onClick={() => setSheetOpen(true)} />
      <Dialog open={sheetOpen} onOpenChange={setSheetOpen}>
        <DialogContent className="data-open:slide-in-from-bottom-8 data-closed:slide-out-to-bottom-8 top-auto bottom-0 left-0 max-h-[85dvh] w-full max-w-none translate-x-0 translate-y-0 overflow-y-auto rounded-b-none border-t-2 border-black bg-white p-0 sm:max-w-none">
          <DialogTitle className="sr-only">{profile.name}</DialogTitle>
          <div className="flex flex-col gap-4 p-6 pt-10">
            <div className="flex items-start gap-4">
              <div className="shadow-block-md relative size-20 shrink-0 overflow-hidden rounded-full border-2 border-amber-900 shadow-amber-500">
                <Headshot
                  name={profile.name}
                  src={profile.imageSrc}
                  // `size-20`, fixed. This sheet only ever opens below lg.
                  sizes="80px"
                />
              </div>
              <div>
                <p className="font-display text-base leading-tight font-extrabold text-black">
                  {profile.name}
                </p>
                {meta && (
                  <p className="mt-0.5 text-xs text-mauve-500">{meta}</p>
                )}
                {profile.titles.map((t) => (
                  <p
                    key={t}
                    className="mt-0.5 text-xs font-semibold text-amber-700"
                  >
                    {t}
                  </p>
                ))}
              </div>
            </div>
            <LeaderDetails profile={profile} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function LeaderCluster({ profiles }: Props) {
  return (
    <>
      <div className="lg:hidden">
        <div
          className="mx-auto mb-6 grid max-w-3xl grid-cols-1 justify-items-center gap-y-8 sm:grid-cols-2 sm:gap-x-2 sm:gap-y-0"
          data-animate-stagger
        >
          {profiles.slice(0, 2).map((member) => (
            <div key={member.slug} data-animate="fade-up">
              <GridLeader profile={member} />
            </div>
          ))}
        </div>
        <div
          className="mt-8 grid grid-cols-2 justify-items-center gap-x-2 gap-y-8 sm:grid-cols-3"
          data-animate-stagger
        >
          {profiles.slice(2).map((member) => (
            <div key={member.slug} data-animate="fade-up">
              <GridLeader profile={member} />
            </div>
          ))}
        </div>
      </div>

      <DesktopCluster profiles={profiles} />
    </>
  );
}
