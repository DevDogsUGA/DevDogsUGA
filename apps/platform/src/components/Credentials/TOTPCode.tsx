"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentOTP } from "~/server/actions/credentials";

interface Props {
  credentialId: string;
}

export default function TOTPCode({ credentialId }: Props) {
  const [otp, setOtp] = useState<string | null>(null);
  const [progress, setProgress] = useState(1);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const validUntilRef = useRef<number | null>(null);

  const fetchOTP = useCallback(async () => {
    try {
      const result = await getCurrentOTP(credentialId);
      setOtp(result.otp);
      validUntilRef.current = result.validUntil;
    } catch {
      setOtp(null);
    }
  }, [credentialId]);

  // Animate the progress ring and schedule the next fetch when the period ends.
  useEffect(() => {
    let alive = true;

    const tick = () => {
      if (!alive) return;
      const now = Date.now();
      const validUntil = validUntilRef.current;
      if (validUntil !== null) {
        const step = 30_000;
        const periodStart = validUntil - step;
        const elapsed = now - periodStart;
        setProgress(Math.max(0, Math.min(1, 1 - elapsed / step)));

        if (now >= validUntil) {
          void fetchOTP();
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    void fetchOTP().then(() => {
      if (alive) rafRef.current = requestAnimationFrame(tick);
    });

    return () => {
      alive = false;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [fetchOTP]);

  const radius = 10;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * progress;

  if (otp === null) {
    return (
      <div className="flex items-center gap-2 text-sm text-mauve-400">
        <span>Loading…</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span className="font-mono text-xl font-semibold tracking-widest text-white">
        {otp.slice(0, 3)}&thinsp;{otp.slice(3)}
      </span>
      {/* Countdown ring */}
      <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
        <circle
          cx="14"
          cy="14"
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.15)"
          strokeWidth="3"
        />
        <circle
          cx="14"
          cy="14"
          r={radius}
          fill="none"
          stroke="#22d3ee"
          strokeWidth="3"
          strokeDasharray={`${dash} ${circumference - dash}`}
          strokeLinecap="round"
          transform="rotate(-90 14 14)"
          style={{ transition: "stroke-dasharray 0.1s linear" }}
        />
      </svg>
    </div>
  );
}
