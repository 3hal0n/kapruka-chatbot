"use client";

import React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { ShoppingContextCard } from "@/components/ShoppingContextCard";

/**
 * SentientOrb — a living, iridescent AI orb built purely from CSS gradients +
 * framer-motion. Rotating conic spectrum under a frosted-glass sphere with an
 * ambient bloom and a breathing specular highlight. Respects reduced-motion.
 */
function SentientOrb() {
  const reduce = useReducedMotion();
  return (
    <motion.div
      variants={{ hidden: { opacity: 0, scale: 0.6 }, show: { opacity: 1, scale: 1, transition: { type: "spring", stiffness: 180, damping: 18 } } }}
      className="relative mb-1 h-28 w-28 md:h-36 md:w-36"
      aria-hidden="true"
    >
      {/* Ambient bloom */}
      <div className="absolute -inset-6 rounded-full bg-[radial-gradient(circle_at_50%_45%,rgba(124,58,173,0.55),transparent_60%)] blur-2xl" />

      {/* Breathing wrapper */}
      <motion.div
        animate={reduce ? undefined : { scale: [1, 1.05, 1] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        className="absolute inset-0"
      >
        {/* Rotating iridescent spectrum */}
        <motion.div
          animate={reduce ? undefined : { rotate: 360 }}
          transition={{ duration: 16, repeat: Infinity, ease: "linear" }}
          className="absolute inset-0 rounded-full"
          style={{
            background:
              "conic-gradient(from 0deg, #3C1B63, #7C3AED, #06B6D4, #FFD700, #C026D3, #7C3AED, #3C1B63)",
          }}
        />
        {/* Frosted glass sphere */}
        <div className="absolute inset-[7%] rounded-full border border-white/15 bg-white/5 shadow-[inset_0_2px_30px_rgba(255,255,255,0.18),inset_0_-10px_30px_rgba(0,0,0,0.4)] backdrop-blur-xl" />
        {/* Inner depth tint */}
        <div className="absolute inset-[7%] rounded-full bg-[radial-gradient(circle_at_68%_72%,rgba(11,4,16,0.55),transparent_55%)]" />
      </motion.div>

      {/* Specular highlight */}
      <motion.div
        animate={reduce ? undefined : { opacity: [0.55, 0.9, 0.55], scale: [1, 1.12, 1] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        className="absolute left-[24%] top-[20%] h-[26%] w-[26%] rounded-full bg-white/80 blur-md"
      />
    </motion.div>
  );
}

interface HeroProps {
  budget: string;
  setBudget: (b: string) => void;
  recipient: string;
  setRecipient: (r: string) => void;
  occasion: string;
  setOccasion: (o: string) => void;
  onContextUpdated?: (type: "budget" | "recipient" | "occasion", value: string) => void;
  theme: "light" | "dark";
}

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
};
const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 240, damping: 24 } },
};

/**
 * Hero — the cinematic empty-state shown before the first message.
 * Bold title + onboarding choice-chip grid, fades out once the chat begins.
 */
export function Hero(props: HeroProps) {
  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="mx-auto flex w-full max-w-2xl flex-col items-center px-1 pt-6 pb-2 text-center md:pt-10"
    >
      <SentientOrb />

      <motion.span
        variants={item}
        className="mb-5 mt-4 inline-flex items-center gap-1.5 rounded-full border border-border bg-primary-soft/60 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground"
      >
        <Sparkles className="h-3.5 w-3.5 text-amber" />
        Ruki AI · Kapruka Concierge
      </motion.span>

      <motion.h1
        variants={item}
        className="text-aurora text-balance text-3xl font-black leading-[1.1] tracking-tight sm:text-4xl md:text-5xl"
      >
        What can Ruki do for you today?
      </motion.h1>

      <motion.p
        variants={item}
        className="mt-4 max-w-md text-sm font-medium leading-relaxed text-muted-foreground md:text-base"
      >
        Your conversational gifting companion — find the perfect gift, check live
        delivery, and check out in seconds. Tell me who it&apos;s for, or set the
        scene below.
      </motion.p>

      <motion.div variants={item} className="mt-7 w-full text-left">
        <ShoppingContextCard {...props} />
      </motion.div>
    </motion.div>
  );
}
