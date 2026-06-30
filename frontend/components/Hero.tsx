"use client";

import React from "react";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { ShoppingContextCard } from "@/components/ShoppingContextCard";

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
      <motion.span
        variants={item}
        className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-border bg-primary-soft/60 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground"
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
