"use client";

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CalendarHeart, Sparkles, AlertCircle } from "lucide-react";
import {
  GIFT_PROFILES,
  GiftProfile,
  daysUntil,
  formatOccasionDate,
} from "@/data/giftProfiles";

interface OccasionCalendarProps {
  /** Fires when a profile card is tapped — patches global filters + greets. */
  onSelectProfile: (profile: GiftProfile) => void;
  /** Currently active profile id (for the selected ring). */
  activeId?: string | null;
}

/** Amber when imminent, soft-rose when comfortably ahead. */
function countdownTone(days: number): { ring: string; chip: string } {
  if (days <= 7) {
    return {
      ring: "shadow-[0_0_18px_rgba(255,215,0,0.35)]",
      chip: "bg-amber text-[#0B0410]",
    };
  }
  if (days <= 30) {
    return {
      ring: "",
      chip: "bg-[#F0B0CC] text-[#3c1b63]",
    };
  }
  return { ring: "", chip: "bg-white/15 text-[#F3F4F6]" };
}

export function OccasionCalendar({ onSelectProfile, activeId }: OccasionCalendarProps) {
  // Compute countdowns on the client only, so the date is the user's "today"
  // and we avoid a server/client hydration mismatch.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    // Client-only: seed with the user's local "today" after mount to avoid an
    // SSR/client hydration mismatch on the countdown numbers.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(new Date());
    // Refresh hourly so countdowns stay accurate across midnight in long sessions.
    const t = setInterval(() => setNow(new Date()), 60 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  // Order by soonest occasion first.
  const ordered = now
    ? [...GIFT_PROFILES].sort(
        (a, b) => daysUntil(a.month, a.day, now) - daysUntil(b.month, b.day, now),
      )
    : GIFT_PROFILES;

  return (
    <div className="rounded-2xl border border-white/10 bg-linear-to-b from-[#251044] to-[#13072a] p-4 shadow-lg shadow-purple-950/30">
      <div className="mb-3 flex items-center gap-2">
        <CalendarHeart className="h-4 w-4 text-amber" />
        <h2 className="text-sm font-extrabold tracking-tight text-[#F3F4F6]">
          Occasion Vibe Calendar
        </h2>
      </div>
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-[#C8B3E4]/70">
        Gift Countdown · tap to plan with Ruki
      </p>

      <div className="scroll-slim flex max-h-72 flex-col gap-2.5 overflow-y-auto pr-1">
        {ordered.map((p, idx) => {
          const days = now ? daysUntil(p.month, p.day, now) : null;
          const tone = countdownTone(days ?? 999);
          const isActive = activeId === p.id;
          return (
            <motion.button
              key={p.id}
              type="button"
              id={`occasion-card-${p.id}`}
              onClick={() => onSelectProfile(p)}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05, type: "spring", stiffness: 240, damping: 22 }}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              className={
                "group relative flex flex-col gap-1.5 rounded-xl border p-3 text-left transition-all duration-300 ease-in-out cursor-pointer " +
                tone.ring +
                (isActive
                  ? " border-amber/70 bg-white/7"
                  : " border-white/10 bg-white/3 hover:bg-white/7 hover:border-white/20")
              }
            >
              {/* Top row: recipient name + days-remaining badge */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-extrabold text-[#F3F4F6] transition-colors duration-300 group-hover:text-white">
                    {p.name}
                  </h3>
                  <p className="mt-0.5 truncate text-[11px] font-semibold text-[#C8B3E4]">
                    {p.occasion} · {formatOccasionDate(p.month, p.day)}
                  </p>
                </div>
                <span
                  className={
                    "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black tabular-nums shadow-sm select-none " +
                    tone.chip
                  }
                >
                  {days === null
                    ? "—"
                    : days === 0
                    ? "Today!"
                    : `${days}d`}
                </span>
              </div>

              {/* Vibe profile summary */}
              <p className="flex items-start gap-1.5 text-[11px] font-medium leading-snug text-[#C8B3E4]/85">
                <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-amber/70" />
                <span className="line-clamp-2">{p.vibeSummary}</span>
              </p>

              {/* Allergen hint */}
              {p.allergen && (
                <p className="flex items-center gap-1 text-[10px] font-semibold text-rose-300/80">
                  <AlertCircle className="h-3 w-3 shrink-0" />
                  Avoids {p.allergen}
                </p>
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
