"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence, useAnimation } from "framer-motion";
import { DotLottieReact, type DotLottie } from "@lottiefiles/dotlottie-react";

export type MascotState = "idle" | "thinking" | "happy" | "typing" | "speaking";

interface RukiMascotProps {
  state?: MascotState;
}

// Self-hosted Lottie character (swap this single path to change the mascot).
// Ghost emoji (Google Noto animated emoji 👻) — the chosen sentient character.
const MASCOT_SRC = "/lottie/ruki-ghost.json";

// Playback speed per conversational state — gives one coherent character
// distinct energy levels instead of swapping between mismatched clips.
const STATE_SPEED: Record<MascotState, number> = {
  idle: 1,
  thinking: 0.6,
  typing: 1.45,
  speaking: 1.4,
  happy: 1.9,
};

const CLICK_MESSAGES = [
  "Ayubōwan! 🎁",
  "Perfect gifts, delivered! ✨",
  "I love helping you shop! 💜",
  "Hehe, I'm ticklish! 😄",
  "Your Kapruka companion! 🇱🇰",
  "Let's find something special! 🌟",
  "Click me again! (◕‿◕)",
  "Gifts make people happy! 🎀",
];

/**
 * RukiMascot — premium DotLottie character driven by conversational state.
 * Falls back to the bespoke on-brand SVG (RukiMascotSvg) if the WASM player
 * fails to load or render (e.g. offline / CDN blocked), so the UI never breaks.
 */
export function RukiMascot({ state = "idle" }: RukiMascotProps) {
  const [failed, setFailed] = useState(false);
  const [clickIdx, setClickIdx] = useState(0);
  const [showBubble, setShowBubble] = useState(false);
  const dotRef = useRef<DotLottie | null>(null);
  const stateRef = useRef<MascotState>(state);
  const bubbleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controls = useAnimation();

  // Keep the latest state available to the async "ready" handler.
  stateRef.current = state;

  // Re-tune playback energy whenever the conversational state changes.
  useEffect(() => {
    const dl = dotRef.current;
    if (!dl) return;
    try { dl.setSpeed(STATE_SPEED[state] ?? 1); } catch { /* not ready yet */ }
  }, [state]);

  // Joyous jump overlay when entering the happy state (cart add / preference click).
  useEffect(() => {
    if (state !== "happy") return;
    controls.start({
      y: [0, -16, 0, -8, 0],
      scale: [1, 1.12, 0.96, 1.06, 1],
      transition: { duration: 0.9, ease: "easeInOut" },
    });
  }, [state, controls]);

  const setRef = useCallback((dl: DotLottie | null) => {
    dotRef.current = dl;
    if (!dl) return;
    dl.addEventListener("loadError", () => setFailed(true));
    dl.addEventListener("renderError", () => setFailed(true));
    dl.addEventListener("ready", () => {
      try { dl.setSpeed(STATE_SPEED[stateRef.current] ?? 1); } catch { /* noop */ }
    });
  }, []);

  const handleClick = useCallback(async () => {
    if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
    setClickIdx(p => (p + 1) % CLICK_MESSAGES.length);
    setShowBubble(true);
    await controls.start({
      scale: [1, 1.22, 0.9, 1.08, 1],
      rotate: [0, -8, 8, -3, 0],
      transition: { duration: 0.5, ease: "easeInOut" },
    });
    bubbleTimer.current = setTimeout(() => setShowBubble(false), 2400);
  }, [controls]);

  if (failed) return <RukiMascotSvg state={state} />;

  const isThinking = state === "thinking";

  return (
    <div className="relative flex flex-col items-center select-none">
      {/* Click delight bubble */}
      <AnimatePresence>
        {showBubble && (
          <motion.div
            key="bubble"
            initial={{ opacity: 0, scale: 0.65, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.65, y: 4 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="absolute -top-10 left-1/2 z-50 -translate-x-1/2 whitespace-nowrap"
          >
            <div className="relative rounded-2xl bg-[#3C1B63] px-3.5 py-1.5 text-[11px] font-bold text-white shadow-xl shadow-purple-950/40">
              {CLICK_MESSAGES[clickIdx]}
              <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 h-2.5 w-2.5 rotate-45 bg-[#3C1B63]" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        animate={controls}
        onClick={handleClick}
        whileTap={{ scale: 0.93 }}
        className="cursor-pointer drop-shadow-[0_12px_30px_rgba(124,58,173,0.5)]"
      >
        {/* Subtle ambient float (idle) / contemplative sway (thinking) */}
        <motion.div
          animate={isThinking ? { rotate: [-3, 3, -3], y: 0 } : { y: [0, -6, 0], rotate: 0 }}
          transition={{ duration: isThinking ? 1 : 3, repeat: Infinity, ease: "easeInOut" }}
        >
          <DotLottieReact
            src={MASCOT_SRC}
            autoplay
            loop
            dotLottieRefCallback={setRef}
            className="h-24 w-24 md:h-28 md:w-28"
          />
        </motion.div>
      </motion.div>
    </div>
  );
}

function RukiMascotSvg({ state = "idle" }: RukiMascotProps) {
  const [blink, setBlink] = useState(false);
  const [clickIdx, setClickIdx] = useState(0);
  const [showBubble, setShowBubble] = useState(false);
  const [isClickTriggered, setIsClickTriggered] = useState(false);
  const controls = useAnimation();
  const bubbleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-blink on a random schedule
  useEffect(() => {
    let blinkTimeout: ReturnType<typeof setTimeout>;
    const scheduleBlink = () => {
      blinkTimeout = setTimeout(() => {
        setBlink(true);
        setTimeout(() => {
          setBlink(false);
          scheduleBlink();
        }, 140);
      }, 2800 + Math.random() * 2400);
    };
    scheduleBlink();
    return () => clearTimeout(blinkTimeout);
  }, []);

  const handleClick = useCallback(async () => {
    if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current);
    setIsClickTriggered(true);
    setClickIdx(prev => (prev + 1) % CLICK_MESSAGES.length);
    setShowBubble(true);

    await controls.start({
      scale: [1, 1.28, 0.87, 1.1, 1],
      rotate: [0, -14, 14, -5, 0],
      transition: { duration: 0.48, ease: "easeInOut" },
    });

    bubbleTimerRef.current = setTimeout(() => {
      setShowBubble(false);
      setIsClickTriggered(false);
    }, 2600);
  }, [controls]);

  const effectiveState = isClickTriggered ? "happy" : state;
  const isHappy = effectiveState === "happy";
  const isThinking = effectiveState === "thinking";
  const isTypingState = effectiveState === "typing";
  const isSpeaking = effectiveState === "speaking";

  const eyeState: "open" | "happy" | "blink" =
    blink ? "blink" : isHappy ? "happy" : "open";

  // Mouth path varies by state
  const mouthPath = isHappy
    ? "M22 47 Q32 56 42 47"
    : isThinking
    ? "M27 48 Q32 51 37 48"
    : isTypingState || isSpeaking
    ? "M23 47 Q32 54 41 47"
    : "M23 46 Q32 53 41 46";

  const mouthFill = isHappy ? "#F0B0CC" : "none";

  return (
    <div className="relative flex flex-col items-center select-none">
      {/* Speech bubble */}
      <AnimatePresence>
        {showBubble && (
          <motion.div
            key="bubble"
            initial={{ opacity: 0, scale: 0.65, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.65, y: 4 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="absolute -top-11 left-1/2 z-50 -translate-x-1/2 whitespace-nowrap"
          >
            <div className="relative rounded-2xl bg-[#3c1b63] px-3.5 py-1.5 text-[11px] font-bold text-white shadow-xl shadow-purple-950/40">
              {CLICK_MESSAGES[clickIdx]}
              {/* Tail */}
              <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 h-2.5 w-2.5 rotate-45 bg-[#3c1b63]" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Thinking dots (only when thinking and no bubble) */}
      <AnimatePresence>
        {isThinking && !showBubble && (
          <motion.div
            key="thinking"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute -top-9 left-1/2 -translate-x-1/2 flex gap-1 rounded-full bg-muted border border-border px-2.5 py-1.5 shadow-sm"
          >
            {[0, 120, 240].map(delay => (
              <span
                key={delay}
                className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce"
                style={{ animationDelay: `${delay}ms` }}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mascot body — spring float or tilt */}
      <motion.div
        animate={controls}
        onClick={handleClick}
        className="cursor-pointer"
        whileTap={{ scale: 0.93 }}
      >
        <motion.div
          animate={
            isThinking
              ? { rotate: [-4, 4, -4], y: 0 }
              : isTypingState
              ? { y: [0, -3, 0], rotate: [-1, 1, -1] }
              : { y: [0, -8, 0], rotate: 0 }
          }
          transition={
            isThinking
              ? { duration: 0.9, repeat: Infinity, ease: "easeInOut" }
              : isTypingState
              ? { duration: 0.7, repeat: Infinity, ease: "easeInOut" }
              : { duration: 2.8, repeat: Infinity, ease: "easeInOut" }
          }
        >
          <svg
            width="72"
            height="92"
            viewBox="0 0 64 84"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* ── Drop shadow ── */}
            <ellipse cx="32" cy="82" rx="17" ry="4" fill="#1E0B36" opacity="0.11" />

            {/* ── Body (gift-patterned sweater) ── */}
            <ellipse cx="32" cy="69" rx="18" ry="14" fill="#3c1b63" />
            {/* Sweater stars */}
            <circle cx="25" cy="68" r="1.5" fill="white" opacity="0.35" />
            <circle cx="39" cy="64" r="1" fill="white" opacity="0.25" />
            <circle cx="37" cy="73" r="1.5" fill="white" opacity="0.35" />
            <circle cx="26" cy="75" r="1" fill="white" opacity="0.2" />

            {/* ── Gift bow at collar ── */}
            {/* Left wing */}
            <path d="M24 56 C18 49 24 44 28 49 C30 52 31 54 32 56" fill="#FFD700" />
            {/* Right wing */}
            <path d="M40 56 C46 49 40 44 36 49 C34 52 33 54 32 56" fill="#FFD700" />
            {/* Knot */}
            <circle cx="32" cy="56" r="4" fill="#FFB800" />
            <circle cx="32" cy="56" r="2" fill="#FFD700" />

            {/* ── Head ── */}
            <ellipse cx="32" cy="30" rx="24" ry="23" fill="#EDD5FF" />

            {/* ── Hair ── */}
            <path
              d="M8 30 C8 10 16 3 32 3 C48 3 56 10 56 30 C56 16 50 5 41 3.5 C38 3 35 2.5 32 2.5 C29 2.5 26 3 23 3.5 C14 5 8 16 8 30 Z"
              fill="#3c1b63"
            />
            {/* Hair shine */}
            <path
              d="M18 8 C16 13 15 19 15 24"
              stroke="#5B2D9A"
              strokeWidth="2"
              strokeLinecap="round"
              opacity="0.5"
            />

            {/* ── Star in hair ── */}
            <path
              d="M50 8 L51.3 11.6 L55.2 11.6 L52.3 13.9 L53.3 17.6 L50 15.5 L46.7 17.6 L47.7 13.9 L44.8 11.6 L48.7 11.6 Z"
              fill="#FFD700"
            />

            {/* ── Ears ── */}
            <ellipse cx="8" cy="33" rx="6" ry="7" fill="#EDD5FF" />
            <ellipse cx="8" cy="33" rx="3.5" ry="4.5" fill="#F0CCFF" />
            <ellipse cx="56" cy="33" rx="6" ry="7" fill="#EDD5FF" />
            <ellipse cx="56" cy="33" rx="3.5" ry="4.5" fill="#F0CCFF" />

            {/* ── Eyes ── */}
            {eyeState === "open" && (
              <>
                {/* Sclera */}
                <circle cx="22" cy="32" r="8.5" fill="white" />
                <circle cx="42" cy="32" r="8.5" fill="white" />
                {/* Iris */}
                <circle cx={isTypingState ? 23 : 22} cy={isTypingState ? 33.5 : 33} r="5.5" fill="#1E0B36" />
                <circle cx={isTypingState ? 43 : 42} cy={isTypingState ? 33.5 : 33} r="5.5" fill="#1E0B36" />
                {/* Main shine */}
                <circle cx={isTypingState ? 25 : 24.5} cy={isTypingState ? 30 : 30} r="2.2" fill="white" />
                <circle cx={isTypingState ? 45 : 44.5} cy={isTypingState ? 30 : 30} r="2.2" fill="white" />
                {/* Mini shine */}
                <circle cx="20" cy="35" r="1.2" fill="white" opacity="0.5" />
                <circle cx="40" cy="35" r="1.2" fill="white" opacity="0.5" />
              </>
            )}
            {eyeState === "blink" && (
              <>
                <path d="M13.5 32 Q22 32 30.5 32" stroke="#1E0B36" strokeWidth="3.5" strokeLinecap="round" />
                <path d="M33.5 32 Q42 32 50.5 32" stroke="#1E0B36" strokeWidth="3.5" strokeLinecap="round" />
              </>
            )}
            {eyeState === "happy" && (
              <>
                {/* ∩ shape — closed happy eyes */}
                <path d="M13.5 32 Q22 24 30.5 32" stroke="#1E0B36" strokeWidth="3" fill="none" strokeLinecap="round" />
                <path d="M33.5 32 Q42 24 50.5 32" stroke="#1E0B36" strokeWidth="3" fill="none" strokeLinecap="round" />
              </>
            )}

            {/* ── Thinking brows (subtle arch when thinking) ── */}
            {isThinking && (
              <>
                <path d="M14 23 Q22 19 30 22" stroke="#3c1b63" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.6" />
                <path d="M34 22 Q42 19 50 23" stroke="#3c1b63" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.6" />
              </>
            )}

            {/* ── Rosy cheeks ── */}
            <circle cx="12" cy="40" r="7" fill="#FFB0C8" opacity="0.36" />
            <circle cx="52" cy="40" r="7" fill="#FFB0C8" opacity="0.36" />

            {/* ── Mouth ── */}
            <path
              d={mouthPath}
              stroke="#C060A0"
              strokeWidth="2"
              fill={mouthFill}
              strokeLinecap="round"
            />
            {/* Teeth visible on happy big smile */}
            {isHappy && (
              <path d="M25 49 Q32 54 39 49" fill="white" />
            )}

            {/* ── Speaking mouth wave ── */}
            {isSpeaking && eyeState === "open" && (
              <motion.path
                d="M23 47 Q27 43 32 47 Q37 51 41 47"
                stroke="#C060A0"
                strokeWidth="2"
                fill="none"
                strokeLinecap="round"
                animate={{ d: ["M23 47 Q27 43 32 47 Q37 51 41 47", "M23 47 Q27 51 32 47 Q37 43 41 47"] }}
                transition={{ duration: 0.4, repeat: Infinity, ease: "easeInOut" }}
              />
            )}
          </svg>
        </motion.div>
      </motion.div>
    </div>
  );
}
