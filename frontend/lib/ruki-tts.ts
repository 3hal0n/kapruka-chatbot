/**
 * lib/ruki-tts.ts — Ruki's voice, shared by the chat loop and the hands-free
 * voice panel.
 *
 * Primary path: POST the reply text to the backend /api/tts endpoint, which
 * synthesizes it with Google Cloud Text-to-Speech (warm FEMALE si-LK profile —
 * native Sinhala script + graceful English, so Tanglish catalog strings stop
 * breaking) and returns MP3 bytes. Played through a single managed
 * HTMLAudioElement so there is never more than one Ruki speaking.
 *
 * Fallback path: if the backend synth fails (API disabled, offline dev), fall
 * back to browser-native speechSynthesis — preferring a female en voice — so
 * voice mode never goes silent.
 *
 * Exactly-once callbacks: `onStart` fires when audio actually begins,
 * `onEnd` fires exactly once whether playback ends, errors, or is cancelled —
 * the hands-free mic loop re-arms off `onEnd`.
 */

const BACKEND_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "http://localhost:8000";

export interface SpeakCallbacks {
  onStart?: () => void;
  /** Fires exactly once: on natural end, on error, or on cancellation. */
  onEnd?: () => void;
}

// ── Singleton playback state ──────────────────────────────────────────────────

let activeAudio: HTMLAudioElement | null = null;
let activeObjectUrl: string | null = null;
let activeOnEnd: (() => void) | null = null;
let endFired = false;

function fireEndOnce() {
  if (endFired) return;
  endFired = true;
  const cb = activeOnEnd;
  activeOnEnd = null;
  cb?.();
}

function releaseAudio() {
  if (activeAudio) {
    activeAudio.onplay = null;
    activeAudio.onended = null;
    activeAudio.onerror = null;
    try {
      activeAudio.pause();
    } catch {
      /* already stopped */
    }
    activeAudio = null;
  }
  if (activeObjectUrl) {
    URL.revokeObjectURL(activeObjectUrl);
    activeObjectUrl = null;
  }
}

/** Stop whatever Ruki is currently saying (backend audio AND browser synth). */
export function stopSpeech(): void {
  releaseAudio();
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  // A cancelled utterance still resolves the caller's loop.
  fireEndOnce();
}

// ── Text preparation ──────────────────────────────────────────────────────────

/** Strip SSE control tokens and markdown so neither engine reads them aloud. */
export function cleanForSpeech(text: string): string {
  return (text || "")
    .replace(/<<[A-Z_]+>>:?\S*/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[*_#`~[\]()>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Browser-native fallback (female-preferring) ───────────────────────────────

function pickFemaleVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices() || [];
  // Common female profiles across Chrome/Edge/macOS. Best-effort only.
  const femaleHints = /female|zira|aria|jenny|samantha|natasha|sonia|neerja/i;
  return (
    voices.find(v => femaleHints.test(v.name) && v.lang.startsWith("en")) ||
    voices.find(v => femaleHints.test(v.name)) ||
    null
  );
}

function speakWithBrowser(text: string, callbacks: SpeakCallbacks): boolean {
  if (typeof window === "undefined" || !window.speechSynthesis) return false;

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = 0.95;
  const voice = pickFemaleVoice();
  if (voice) utterance.voice = voice;
  else utterance.pitch = 1.15; // nudge the default male profile toward Ruki's register

  utterance.onstart = () => callbacks.onStart?.();
  utterance.onend = () => fireEndOnce();
  utterance.onerror = () => fireEndOnce();

  window.speechSynthesis.speak(utterance);
  return true;
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Speak `text` aloud. Resolves once playback has been INITIATED (true) or
 * everything failed (false, `onEnd` already fired). Any previous speech is
 * cancelled first.
 */
export async function speakText(
  text: string,
  callbacks: SpeakCallbacks = {},
): Promise<boolean> {
  const clean = cleanForSpeech(text);

  // Cancel anything in flight (this also fires the previous onEnd once).
  stopSpeech();

  endFired = false;
  activeOnEnd = callbacks.onEnd ?? null;

  if (!clean) {
    fireEndOnce();
    return false;
  }

  // ── Primary: backend Google Cloud TTS (female si-LK, Sinhala-capable) ──
  try {
    const res = await fetch(`${BACKEND_URL}/api/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: clean }),
    });
    if (!res.ok) throw new Error(`TTS backend ${res.status}`);

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    activeAudio = audio;
    activeObjectUrl = url;

    audio.onplay = () => callbacks.onStart?.();
    audio.onended = () => {
      releaseAudio();
      fireEndOnce();
    };
    audio.onerror = () => {
      releaseAudio();
      fireEndOnce();
    };

    await audio.play();
    return true;
  } catch {
    releaseAudio();
    // ── Fallback: browser-native synthesis so Ruki is never mute ──
    if (speakWithBrowser(clean, callbacks)) return true;
    fireEndOnce();
    return false;
  }
}
