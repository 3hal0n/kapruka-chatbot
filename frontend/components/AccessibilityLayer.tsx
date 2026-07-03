"use client";

/**
 * AccessibilityLayer.tsx — dedicated hands-free Voice Assistant Mode.
 *
 * Full-screen, ultra-high-contrast overlay for low-vision / motor-impaired /
 * voice-first shoppers:
 *  - Web Speech API `SpeechRecognition` captures the request.
 *  - Every assistant reply is spoken aloud via `speechSynthesis` while open.
 *  - Tap targets exceed 64px, layout is semantic and screen-reader friendly,
 *    and a live frequency-style animation gives non-verbal listening feedback.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, X, Volume2 } from "lucide-react";

interface AccessibilityLayerProps {
  open: boolean;
  onClose: () => void;
  /** Route the captured transcript into the agent gateway (SSE chat). */
  onSubmit: (text: string) => void;
  /** True while the backend is working — pauses the listening loop. */
  isBusy: boolean;
  /** Latest assistant reply; spoken aloud whenever it changes while open. */
  lastResponse: string;
}

type VoicePhase = "idle" | "listening" | "thinking" | "speaking";

function getSpeechRecognition(): any | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

/** Animated frequency bars — visual feedback that Ruki is listening/speaking. */
function FrequencyBars({ active, color }: { active: boolean; color: string }) {
  const bars = [14, 30, 22, 44, 28, 52, 34, 52, 28, 44, 22, 30, 14];
  return (
    <div className="flex h-16 items-center justify-center gap-1.5" aria-hidden="true">
      {bars.map((h, i) => (
        <motion.span
          key={i}
          className={`w-1.5 rounded-full ${color}`}
          animate={
            active
              ? { height: [h * 0.4, h, h * 0.55, h * 0.9, h * 0.4] }
              : { height: 6 }
          }
          transition={
            active
              ? { duration: 1.1, repeat: Infinity, delay: i * 0.06, ease: "easeInOut" }
              : { duration: 0.3 }
          }
          style={{ height: 6 }}
        />
      ))}
    </div>
  );
}

export function AccessibilityLayer({
  open,
  onClose,
  onSubmit,
  isBusy,
  lastResponse,
}: AccessibilityLayerProps) {
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [transcript, setTranscript] = useState("");
  const [supported, setSupported] = useState(true);

  const recognitionRef = useRef<any>(null);
  const phaseRef = useRef<VoicePhase>("idle");
  const openRef = useRef(open);
  const spokenRef = useRef<string>("");

  phaseRef.current = phase;
  openRef.current = open;

  // ── Speech-to-text engine ───────────────────────────────────────────────────
  useEffect(() => {
    const rec = getSpeechRecognition();
    if (!rec) {
      setSupported(false);
      return;
    }
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = "en-US"; // adaptable to localized parameters dynamically

    rec.onresult = (event: any) => {
      const currentResult = event.results[0][0].transcript?.trim();
      if (currentResult) {
        setTranscript(currentResult);
        setPhase("thinking");
        // Automatically route to the backend multi-agent loop gateway.
        onSubmit(currentResult);
      } else {
        setPhase("idle");
      }
    };
    rec.onerror = () => setPhase("idle");
    rec.onend = () => {
      // If recognition ended without producing a result, drop back to idle.
      if (phaseRef.current === "listening") setPhase("idle");
    };

    recognitionRef.current = rec;
    return () => {
      try {
        rec.abort?.();
      } catch {
        /* already stopped */
      }
      recognitionRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startListening = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec || isBusy) return;
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    try {
      rec.start();
      setTranscript("");
      setPhase("listening");
    } catch {
      /* recognition already active */
    }
  }, [isBusy]);

  const stopListening = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {
      /* not running */
    }
    setPhase("idle");
  }, []);

  const toggleVoiceMode = () => {
    if (!supported) return;
    if (phase === "listening") stopListening();
    else startListening();
  };

  // ── Text-to-speech: speak each new assistant reply while the mode is open ──
  useEffect(() => {
    if (!open || !lastResponse) return;
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    if (spokenRef.current === lastResponse) return;
    spokenRef.current = lastResponse;

    const cleanText = lastResponse.replace(/<<.*?>>/g, "").replace(/[*_#`]/g, "").trim();
    if (!cleanText) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = "en-US";
    utterance.rate = 0.95;
    utterance.onstart = () => setPhase("speaking");
    utterance.onend = () => {
      // Hands-free loop: re-open the microphone after Ruki finishes speaking.
      if (openRef.current) startListening();
      else setPhase("idle");
    };
    utterance.onerror = () => setPhase("idle");
    window.speechSynthesis.speak(utterance);
  }, [lastResponse, open, startListening]);

  // Reflect backend progress and stop everything when the overlay closes.
  useEffect(() => {
    if (!open) {
      stopListening();
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      setPhase("idle");
      setTranscript("");
      return;
    }
    if (isBusy && phaseRef.current !== "speaking") setPhase("thinking");
  }, [open, isBusy, stopListening]);

  const phaseLabel: Record<VoicePhase, string> = {
    idle: "Tap the microphone and tell Ruki what you need",
    listening: "Ruki AI is listening…",
    thinking: "Ruki is finding that for you…",
    speaking: "Ruki is speaking…",
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.section
          role="dialog"
          aria-modal="true"
          aria-label="Ruki voice assistant mode"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-100 flex flex-col items-center justify-between bg-slate-950 px-6 py-10 text-white"
        >
          {/* Header */}
          <header className="flex w-full max-w-2xl items-center justify-between">
            <h2 className="text-2xl font-black tracking-tight">
              Voice Assistant <span className="text-purple-400">Mode</span>
            </h2>
            <button
              onClick={onClose}
              aria-label="Exit voice assistant mode"
              className="grid h-16 w-16 min-h-16 min-w-16 place-items-center rounded-full border-2 border-white/25 bg-white/10 transition-colors hover:bg-white/20 focus-visible:outline-4 focus-visible:outline-purple-400"
            >
              <X className="h-8 w-8" aria-hidden="true" />
            </button>
          </header>

          {/* Live status canvas */}
          <main className="flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-8 text-center">
            <FrequencyBars
              active={phase === "listening" || phase === "speaking"}
              color={phase === "speaking" ? "bg-emerald-400" : "bg-purple-400"}
            />

            <p
              aria-live="polite"
              className="text-3xl font-bold leading-snug text-white"
            >
              {phaseLabel[phase]}
            </p>

            {transcript && (
              <p className="max-w-xl rounded-2xl border border-purple-500/30 bg-purple-500/10 px-6 py-4 font-mono text-lg text-purple-200">
                “{transcript}”
              </p>
            )}

            {!supported && (
              <p role="alert" className="max-w-xl text-xl font-semibold text-amber-300">
                Speech recognition isn&apos;t supported in this browser. Please use
                Chrome or Edge for hands-free shopping.
              </p>
            )}
          </main>

          {/* Primary controls — every target is ≥64px */}
          <footer className="flex w-full max-w-2xl items-center justify-center gap-10 pb-4">
            <div className="flex flex-col items-center gap-3">
              <button
                onClick={toggleVoiceMode}
                disabled={!supported || isBusy}
                aria-label={
                  phase === "listening"
                    ? "Stop listening voice control"
                    : "Activate voice navigation engine"
                }
                className={`grid h-24 w-24 min-h-24 min-w-24 place-items-center rounded-full shadow-2xl transition-all focus-visible:outline-4 focus-visible:outline-white disabled:opacity-40 ${
                  phase === "listening"
                    ? "animate-pulse bg-red-600 hover:bg-red-500"
                    : "bg-purple-600 hover:bg-purple-500"
                }`}
              >
                <Mic className="h-11 w-11" aria-hidden="true" />
              </button>
              <span className="text-base font-bold text-white/80">
                {phase === "listening" ? "Stop" : "Speak"}
              </span>
            </div>

            <div className="flex flex-col items-center gap-3">
              <div
                aria-hidden="true"
                className="grid h-24 w-24 place-items-center rounded-full border-2 border-white/15 bg-white/5"
              >
                <Volume2
                  className={`h-11 w-11 ${
                    phase === "speaking" ? "text-emerald-400" : "text-white/40"
                  }`}
                />
              </div>
              <span className="text-base font-bold text-white/80">Replies aloud</span>
            </div>
          </footer>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
