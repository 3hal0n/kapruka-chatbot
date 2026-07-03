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
// Generation counter: every new speak/stop invalidates the async continuations
// (pending fetches, queued chunks) of the previous one.
let generation = 0;

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
  generation++; // invalidate any in-flight chunk fetch/playback chain
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

// ── Chunked synthesis for latency ─────────────────────────────────────────────

/**
 * Split long replies into [first sentence(s), remainder] so the opening audio
 * starts playing while the (bigger) remainder is still being synthesized —
 * this is where most of the perceived "voice takes too long" latency went.
 */
function splitForLatency(text: string): string[] {
  if (text.length < 180) return [text];
  const window = text.slice(0, 260);
  let cut = -1;
  for (const stop of [". ", "! ", "? ", "। ", "; "]) {
    const idx = window.indexOf(stop, 40);
    if (idx !== -1 && (cut === -1 || idx < cut)) cut = idx + stop.length - 1;
  }
  if (cut === -1) return [text];
  const head = text.slice(0, cut).trim();
  const tail = text.slice(cut).trim();
  return tail ? [head, tail] : [head];
}

async function fetchTTSUrl(text: string): Promise<string> {
  const res = await fetch(`${BACKEND_URL}/api/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`TTS backend ${res.status}`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

/** Play one blob URL; resolves true on natural end, rejects on decode error. */
function playUrl(url: string, gen: number, onStart?: () => void): Promise<boolean> {
  return new Promise((resolve, reject) => {
    if (gen !== generation) {
      URL.revokeObjectURL(url);
      resolve(false);
      return;
    }
    const audio = new Audio(url);
    activeAudio = audio;
    activeObjectUrl = url;
    audio.onplay = () => onStart?.();
    audio.onended = () => {
      releaseAudio();
      resolve(true);
    };
    audio.onerror = () => {
      releaseAudio();
      reject(new Error("audio decode/playback failed"));
    };
    audio.play().catch(reject);
  });
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

  const gen = ++generation;
  endFired = false;
  activeOnEnd = callbacks.onEnd ?? null;

  if (!clean) {
    fireEndOnce();
    return false;
  }

  // ── Primary: backend Google Cloud TTS (language-aware female voice) ──
  // Both chunks are requested CONCURRENTLY; chunk 1 starts playing as soon as
  // it lands while chunk 2 finishes synthesizing in the background.
  const chunks = splitForLatency(clean);
  const pending = chunks.map(c => fetchTTSUrl(c));
  let started = false;

  try {
    for (let i = 0; i < pending.length; i++) {
      const url = await pending[i];
      if (gen !== generation) {
        URL.revokeObjectURL(url);
        return true; // superseded by a newer speak/stop
      }
      const finished = await playUrl(url, gen, () => {
        if (!started) {
          started = true;
          callbacks.onStart?.();
        }
      });
      if (!finished || gen !== generation) return true;
    }
    fireEndOnce();
    return true;
  } catch {
    if (gen !== generation) return true;
    releaseAudio();
    // Clean up any remaining fetched-but-unplayed chunk URLs.
    pending.forEach(p => p.then(u => URL.revokeObjectURL(u)).catch(() => {}));
    // If part of the reply already played, don't re-speak from the start with
    // the browser voice — just end the turn cleanly.
    if (started) {
      fireEndOnce();
      return true;
    }
    // ── Fallback: browser-native synthesis so Ruki is never mute ──
    if (speakWithBrowser(clean, callbacks)) return true;
    fireEndOnce();
    return false;
  }
}
