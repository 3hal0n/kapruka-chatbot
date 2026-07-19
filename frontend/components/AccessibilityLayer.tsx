"use client";

/**
 * AccessibilityLayer.tsx — hands-free Voice Assistant as an ambient overlay.
 *
 * NOT a full-screen takeover: the regular chat log, product carousels, and
 * cart stay fully visible and interactive. This renders as a floating card —
 * centered on desktop, docked below the floating pills on mobile — built
 * around a voice-reactive WebGL orb with the mic control at its centre.
 *
 * Everything routes through the normal chat pipeline: spoken input is
 * submitted exactly like a typed message (so the transcript lands in chat
 * history), the AI's text reply renders in the chat log with its product
 * carousel, and the reply is read aloud while the panel shows "speaking".
 * After Ruki finishes speaking, the mic automatically re-opens (hands-free
 * loop) until the panel is closed.
 *
 * Theme-aware: styled with the design tokens (surface/border/foreground), so
 * it follows the app's light/dark mode instead of forcing a dark "phone call"
 * screen.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, X, Volume2 } from "lucide-react";
import { VoicePoweredOrb } from "@/components/ui/voice-powered-orb";
import { speakText, stopSpeech } from "@/lib/ruki-tts";

interface AccessibilityLayerProps {
  open: boolean;
  onClose: () => void;
  /** Route the captured transcript into the agent gateway (SSE chat). */
  onSubmit: (text: string) => void;
  /** True while the backend is working — pauses the listening loop. */
  isBusy: boolean;
  /** Latest assistant reply; spoken aloud whenever it changes while open. */
  lastResponse: string;
  /**
   * Set when the cart or left sidebar drawer is open. Those drawers only
   * cover part of the screen (see RightCart/LeftSidebar's w-[340px]
   * max-w-[88vw]), leaving a dimmed backdrop sliver on the other side. A
   * panel centered on the full viewport would straddle both, half sitting on
   * the dim backdrop — so instead it docks to the same side/width as the
   * open drawer.
   */
  obscuredSide?: "left" | "right" | null;
}

type VoicePhase = "idle" | "listening" | "thinking" | "speaking";

// Minimal shape of the Web Speech API surface this component actually uses —
// the DOM lib doesn't ship types for it, and the alternative is `any`.
interface SpeechRecognitionResultEvent {
  results: { [index: number]: { [index: number]: { transcript: string } } };
}
interface SpeechRecognitionErrorEvent {
  error?: string;
}
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort?: () => void;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognition(): SpeechRecognitionLike | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

/** Compact animated frequency bars — listening/speaking feedback. */
function FrequencyBars({ active, color }: { active: boolean; color: string }) {
  const bars = [8, 18, 12, 26, 16, 30, 20, 30, 16, 26, 12, 18, 8];
  return (
    <div className="flex h-8 shrink-0 items-center justify-center gap-1" aria-hidden="true">
      {bars.map((h, i) => (
        <motion.span
          key={i}
          className={`w-1 rounded-full ${color}`}
          animate={
            active
              ? { height: [h * 0.4, h, h * 0.55, h * 0.9, h * 0.4] }
              : { height: 4 }
          }
          transition={
            active
              ? { duration: 1.1, repeat: Infinity, delay: i * 0.06, ease: "easeInOut" }
              : { duration: 0.3 }
          }
          style={{ height: 4 }}
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
  obscuredSide = null,
}: AccessibilityLayerProps) {
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [transcript, setTranscript] = useState("");
  const [supported, setSupported] = useState(true);
  // Microphone blocked (permission denied) or unavailable (insecure HTTP context).
  const [micBlocked, setMicBlocked] = useState(false);
  // Cache a successful permission check so we don't re-prompt on every loop turn.
  const micOkRef = useRef(false);
  // Mic language: the Web Speech recognizer transcribes ONE language at a
  // time — "mata cake ekak oni" through en-US becomes "butter cake peacock
  // hone". The toggle switches the recognizer to si-LK for Sinhala speakers.
  const [voiceLang, setVoiceLang] = useState<"en-US" | "si-LK">("en-US");

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const phaseRef = useRef<VoicePhase>("idle");
  const openRef = useRef(open);
  const spokenRef = useRef<string>("");
  const voiceLangRef = useRef(voiceLang);
  // Always call the LATEST onSubmit: the recognition engine is created once
  // on mount, and binding onSubmit directly into its onresult would freeze
  // the first render's handler (whose chat-history closure is the EMPTY
  // initial array — submitting through it wiped the whole conversation).
  const onSubmitRef = useRef(onSubmit);

  // Mirror the latest props/state into refs for the recognition callbacks
  // (which close over refs, not props, since the engine is created once on
  // mount). Runs after every commit rather than during render.
  useEffect(() => {
    phaseRef.current = phase;
    openRef.current = open;
    voiceLangRef.current = voiceLang;
    onSubmitRef.current = onSubmit;
  });

  // Restore the user's preferred mic language — a one-time hydration from
  // localStorage, which doesn't exist during SSR, so it must run client-side.
  useEffect(() => {
    const stored = typeof window !== "undefined" && localStorage.getItem("ruki_voice_lang");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time localStorage hydration on mount, not a render-derived value
    if (stored === "si-LK" || stored === "en-US") setVoiceLang(stored);
  }, []);

  const switchVoiceLang = (lang: "en-US" | "si-LK") => {
    setVoiceLang(lang);
    try {
      localStorage.setItem("ruki_voice_lang", lang);
    } catch {
      /* storage unavailable */
    }
  };

  // ── Speech-to-text engine ───────────────────────────────────────────────────
  useEffect(() => {
    const rec = getSpeechRecognition();
    if (!rec) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time browser feature detection on mount
      setSupported(false);
      return;
    }
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = voiceLangRef.current; // re-read per start in startListening

    rec.onresult = (event: SpeechRecognitionResultEvent) => {
      const currentResult = event.results[0][0].transcript?.trim();
      if (currentResult) {
        setTranscript(currentResult);
        setPhase("thinking");
        // Routes through the SAME path as typed input — the transcript is
        // appended to chat history and the reply streams into the chat log.
        // Via the ref so we always hit the latest handler (see onSubmitRef).
        onSubmitRef.current(currentResult);
      } else {
        setPhase("idle");
      }
    };
    rec.onerror = (event: SpeechRecognitionErrorEvent) => {
      // Permission denied at the recognizer level (covers browsers where the
      // Speech API surfaces the block instead of getUserMedia).
      if (event?.error === "not-allowed" || event?.error === "service-not-allowed") {
        micOkRef.current = false;
        setMicBlocked(true);
      }
      setPhase("idle");
    };
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
  }, []);

  // Pre-flight microphone check: catches NotAllowedError (user blocked the
  // mic) and insecure contexts (plain HTTP, where mediaDevices is undefined)
  // so we can explain the fix instead of silently failing to listen.
  const ensureMicAccess = useCallback(async (): Promise<boolean> => {
    if (micOkRef.current) return true;
    if (typeof window === "undefined") return false;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setMicBlocked(true);
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop()); // probe only — release at once
      micOkRef.current = true;
      return true;
    } catch {
      // NotAllowedError (blocked), NotFoundError (no device), SecurityError…
      setMicBlocked(true);
      return false;
    }
  }, []);

  const startListening = useCallback(async () => {
    const rec = recognitionRef.current;
    if (!rec || isBusy) return;
    if (!(await ensureMicAccess())) return;
    // Silence any in-flight Ruki audio (backend MP3 or browser synth) so the
    // mic never captures her own voice.
    stopSpeech();
    try {
      rec.lang = voiceLangRef.current;
      rec.start();
      setTranscript("");
      setPhase("listening");
    } catch {
      /* recognition already active */
    }
  }, [isBusy, ensureMicAccess]);

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

  // ── Text-to-speech: read each new assistant reply aloud while open ─────────
  // Primary voice is the backend's Google Cloud TTS (warm female si-LK profile,
  // handles Sinhala script + Tanglish natively); lib/ruki-tts falls back to
  // browser synthesis automatically if the backend is unreachable.
  useEffect(() => {
    if (!open || !lastResponse) return;
    if (spokenRef.current === lastResponse) return;
    spokenRef.current = lastResponse;

    speakText(lastResponse, {
      onStart: () => {
        // Clear the listener instance while Ruki is speaking — the mic must
        // never capture her own audio and echo it back as a request.
        try {
          recognitionRef.current?.abort?.();
        } catch {
          /* not running */
        }
        setPhase("speaking");
      },
      onEnd: () => {
        // Hands-free loop: the moment playback finishes, re-open the mic.
        if (openRef.current) startListening();
        else setPhase("idle");
      },
    });
  }, [lastResponse, open, startListening]);

  // Reflect backend progress and stop everything when the panel closes.
  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronizing the recognition/speech engines (external systems) to the `open` prop closing
      stopListening();
      stopSpeech();
      setPhase("idle");
      setTranscript("");
      return;
    }
    if (isBusy && phaseRef.current !== "speaking") setPhase("thinking");
  }, [open, isBusy, stopListening]);

  const phaseLabel: Record<VoicePhase, string> = {
    idle: "Tap the mic and speak",
    listening: "Listening…",
    thinking: "Ruki is finding that…",
    speaking: "Ruki is speaking…",
  };

  const phaseColor: Record<VoicePhase, string> = {
    idle: "text-muted-foreground",
    listening: "text-primary-vivid",
    thinking: "text-muted-foreground",
    speaking: "text-amber",
  };

  return (
    <>
    {/* Microphone permission / secure-context error modal */}
    <AnimatePresence>
      {micBlocked && (
        <motion.div
          className="fixed inset-0 z-110 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMicBlocked(false)} />
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-label="Microphone access blocked"
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 12 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className="relative z-10 w-full max-w-sm rounded-2xl border border-border bg-background p-6 text-center shadow-2xl"
          >
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-red-500/10">
              <MicOff className="h-7 w-7 text-red-500" aria-hidden="true" />
            </span>
            <h2 className="mt-3 text-base font-black tracking-tight text-foreground">
              Microphone Access Blocked
            </h2>
            <p className="mt-2 text-xs font-medium leading-relaxed text-muted-foreground">
              To use Hands-Free Mode, please click the site settings icon (🔒) in your
              browser&apos;s URL bar and allow microphone permissions.
              <br />
              <span className="mt-1 inline-block font-bold text-foreground/80">
                Note: Voice features require a secure connection.
              </span>
            </p>
            <button
              onClick={() => setMicBlocked(false)}
              className="mt-4 w-full rounded-xl bg-linear-to-r from-primary-vivid to-primary-vivid-soft py-2.5 text-sm font-black text-primary-foreground transition-all hover:brightness-105 active:scale-[0.98] cursor-pointer"
            >
              Got it
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>

    <AnimatePresence>
      {open && (
        // Centered on desktop; docked below the floating pills on mobile
        // (pt-20 clears them). The pointer-events-none wrapper keeps the chat
        // behind fully scrollable/clickable outside the card itself.
        <div
          className={`pointer-events-none fixed inset-0 z-60 flex items-start px-4 pt-20 md:items-center md:pt-4 ${
            obscuredSide === "right" ? "justify-end" : obscuredSide === "left" ? "justify-start" : "justify-center"
          }`}
        >
          <motion.section
            role="complementary"
            aria-label="Ruki hands-free voice assistant"
            initial={{ opacity: 0, y: 24, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            className={`pointer-events-auto flex flex-col items-center gap-3 rounded-3xl border border-border bg-surface/90 p-5 shadow-2xl shadow-primary-glow backdrop-blur-xl ${
              // Matches RightCart/LeftSidebar's own w-85 max-w-[88vw] exactly,
              // so the card's edges land flush with the open drawer's, instead
              // of spilling onto the dimmed backdrop beside it.
              obscuredSide ? "w-85 max-w-[88vw]" : "w-full max-w-sm"
            }`}
          >
            {/* Header — title + exit */}
            <div className="flex w-full items-center justify-between">
              <p className="text-sm font-black tracking-tight text-foreground">
                Ruki Hands-Free
              </p>
              <button
                onClick={onClose}
                aria-label="Exit voice assistant mode"
                className="grid h-10 w-10 min-h-10 min-w-10 shrink-0 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-3 focus-visible:outline-ring cursor-pointer"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            {/* Voice-reactive orb with the mic control at its centre */}
            <div className="relative h-44 w-44 md:h-56 md:w-56">
              <VoicePoweredOrb enableVoiceControl={phase === "listening"} />
              <button
                onClick={toggleVoiceMode}
                disabled={!supported || isBusy}
                aria-label={
                  phase === "listening"
                    ? "Stop listening voice control"
                    : "Activate voice navigation engine"
                }
                className={`absolute left-1/2 top-1/2 grid h-14 w-14 min-h-14 min-w-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-white shadow-lg transition-all focus-visible:outline-3 focus-visible:outline-ring disabled:opacity-40 cursor-pointer ${
                  phase === "listening"
                    ? "animate-pulse bg-red-600 hover:bg-red-500"
                    : "bg-linear-to-r from-primary-vivid to-primary-vivid-soft hover:brightness-110"
                }`}
              >
                <Mic className="h-6 w-6" aria-hidden="true" />
              </button>
            </div>

            {/* Status + speech-output bars + live transcript */}
            <div className="flex w-full flex-col items-center gap-1 text-center">
              <div className="flex items-center gap-2">
                <p
                  aria-live="polite"
                  className={`truncate text-sm font-extrabold ${phaseColor[phase]}`}
                >
                  {supported ? phaseLabel[phase] : "Voice needs Chrome or Edge"}
                </p>
                {phase === "speaking" && (
                  <Volume2 className="h-4 w-4 shrink-0 text-amber" aria-hidden="true" />
                )}
              </div>
              <FrequencyBars active={phase === "speaking"} color="bg-amber" />
              <p className="w-full truncate text-[11px] font-medium text-muted-foreground">
                {transcript ? (
                  <span className="font-mono">“{transcript}”</span>
                ) : (
                  "Replies read aloud — chat stays live behind"
                )}
              </p>
            </div>

            {/* Mic language — the recognizer transcribes one language at a
                time; Sinhala speakers flip to සිං for accurate capture. */}
            <div
              role="group"
              aria-label="Microphone language"
              className="flex shrink-0 overflow-hidden rounded-full border border-border"
            >
              {([["en-US", "EN"], ["si-LK", "සිං"]] as const).map(([code, label]) => (
                <button
                  key={code}
                  onClick={() => switchVoiceLang(code)}
                  aria-pressed={voiceLang === code}
                  aria-label={code === "en-US" ? "Listen in English" : "Listen in Sinhala"}
                  className={`px-3 py-1.5 text-[11px] font-black transition-colors cursor-pointer ${
                    voiceLang === code
                      ? "bg-primary-vivid text-primary-foreground"
                      : "bg-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </motion.section>
        </div>
      )}
    </AnimatePresence>
    </>
  );
}
