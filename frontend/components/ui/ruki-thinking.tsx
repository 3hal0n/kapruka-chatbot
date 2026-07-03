"use client";

/**
 * RukiThinkingMark — the animated brand mark shown while Ruki is working,
 * in the spirit of Claude's pulsing-logo loader.
 *
 * Composition (pure SVG + framer-motion, no Lottie asset to fetch, exact
 * brand palette, crisp at any size, works in light and dark):
 *  - An orbiting "comet" arc sweeping purple → Kapruka gold with a gold
 *    head dot, rotating continuously around the mark.
 *  - The Ruki smiley (purple eyes, gold smile) breathing softly inside it.
 */

import React from "react";
import { motion } from "framer-motion";
import { RukiLogo } from "@/components/ui/logo";

interface RukiThinkingMarkProps {
  className?: string;
}

export function RukiThinkingMark({ className = "h-7 w-7" }: RukiThinkingMarkProps) {
  return (
    <div className={`relative shrink-0 ${className}`} aria-hidden="true">
      {/* Orbiting comet arc */}
      <motion.svg
        viewBox="0 0 100 100"
        className="absolute inset-0 h-full w-full"
        animate={{ rotate: 360 }}
        transition={{ duration: 2.2, repeat: Infinity, ease: "linear" }}
      >
        <defs>
          <linearGradient id="rukiThinkArc" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#7C3AED" stopOpacity="0" />
            <stop offset="35%" stopColor="#7C3AED" />
            <stop offset="80%" stopColor="#A78BFA" />
            <stop offset="100%" stopColor="#FFD700" />
          </linearGradient>
        </defs>
        {/* r=46 → circumference ≈ 289; ~70% arc with a trailing gap */}
        <circle
          cx="50"
          cy="50"
          r="46"
          fill="none"
          stroke="url(#rukiThinkArc)"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray="202 87"
        />
        {/* Gold comet head, sitting at the arc's leading edge */}
        <circle cx="96" cy="50" r="6" fill="#FFD700" />
      </motion.svg>

      {/* Breathing Ruki smiley */}
      <motion.div
        className="absolute inset-[16%]"
        animate={{ scale: [1, 1.1, 1] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
      >
        <RukiLogo className="h-full w-full" animateHover={false} />
      </motion.div>
    </div>
  );
}
