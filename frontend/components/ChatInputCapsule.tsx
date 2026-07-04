"use client";

import React, { useRef, useState, useEffect } from "react";
import { Mic, MicOff, Camera, Volume2, VolumeX, Send } from "lucide-react";

// Minimal shape of the Web Speech API surface this component uses — the DOM
// lib doesn't ship types for it, and the alternative is `any`.
interface SpeechRecognitionResultEvent {
  results: { [index: number]: { [index: number]: { transcript: string } }; length: number };
}
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

interface ChatInputCapsuleProps {
  messageInput: string;
  setMessageInput: (val: string | ((prev: string) => string)) => void;
  isMicActive: boolean;
  setIsMicActive: (v: boolean) => void;
  isCameraActive: boolean;
  setIsCameraActive: (v: boolean) => void;
  isAudioActive: boolean;
  setIsAudioActive: (v: boolean) => void;
  onSend: () => void;
}

export function ChatInputCapsule({
  messageInput,
  setMessageInput,
  isMicActive,
  setIsMicActive,
  isAudioActive,
  setIsAudioActive,
  onSend,
}: ChatInputCapsuleProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const [attachments, setAttachments] = useState<{ name: string; url: string; type: string }[]>([]);

  // 1. Voice Input (Speech Recognition STT)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const w = window as unknown as {
        SpeechRecognition?: SpeechRecognitionCtor;
        webkitSpeechRecognition?: SpeechRecognitionCtor;
      };
      const SpeechRecognition = w.SpeechRecognition || w.webkitSpeechRecognition;
      if (SpeechRecognition) {
        const rec = new SpeechRecognition();
        rec.continuous = true;
        rec.interimResults = false;
        rec.lang = "en-US";

        rec.onresult = (event: SpeechRecognitionResultEvent) => {
          const text = event.results[event.results.length - 1][0].transcript;
          if (text) {
            setMessageInput(prev => (prev ? prev + " " : "") + text.trim());
          }
        };

        rec.onerror = () => {
          setIsMicActive(false);
        };

        rec.onend = () => {
          setIsMicActive(false);
        };

        recognitionRef.current = rec;
      }
    }
  }, [setMessageInput, setIsMicActive]);

  // Press-and-hold STT: transcription runs ONLY while the mic is held down.
  const startListening = () => {
    if (!recognitionRef.current) {
      alert("Speech recognition is not supported in this browser. Please use Chrome or Edge.");
      return;
    }
    if (isMicActive) return;
    try {
      recognitionRef.current.start();
      setIsMicActive(true);
    } catch {
      // already started — ignore
    }
  };

  const stopListening = () => {
    if (!recognitionRef.current) return;
    try {
      recognitionRef.current.stop();
    } catch {
      // not running — ignore
    }
    setIsMicActive(false);
  };

  // 2. Attach Files & Images
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        setAttachments(prev => [
          ...prev,
          {
            name: file.name,
            url: event.target?.result as string || "",
            type: file.type
          }
        ]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  // 3. Send Handler including attachments info
  const handleSendWrapper = () => {
    let finalMsg = messageInput.trim();
    if (attachments.length > 0) {
      const names = attachments.map(a => a.name).join(", ");
      finalMsg += (finalMsg ? "\n\n" : "") + `[Attached files: ${names}]`;
    }
    if (!finalMsg) return;
    setMessageInput(finalMsg);
    setAttachments([]);
    // brief timeout to allow setState to register
    setTimeout(() => {
      onSend();
    }, 50);
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 px-3 pb-3 md:px-6 md:pb-5 z-20">
      <div className="pointer-events-auto mx-auto flex max-w-3xl flex-col gap-2 rounded-2xl border border-border bg-surface/80 p-2.5 shadow-lg backdrop-blur-md focus-within:ring-1 focus-within:ring-ring/40">
        
        {/* Render Attachments Previews */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 px-1 pb-2 border-b border-border/40 select-none">
            {attachments.map((file, idx) => (
              <div key={idx} className="relative flex items-center gap-1.5 rounded-xl bg-muted p-1.5 text-xs font-semibold">
                {file.type.startsWith("image/") ? (
                  <img src={file.url} alt={file.name} className="h-8 w-8 rounded object-cover" />
                ) : (
                  <div className="grid h-8 w-8 place-items-center rounded bg-primary-soft text-primary text-[10px] font-bold">
                    FILE
                  </div>
                )}
                <span className="max-w-[120px] truncate text-[11px] text-foreground">{file.name}</span>
                <button
                  type="button"
                  onClick={() => removeAttachment(idx)}
                  className="ml-1 text-muted-foreground hover:text-foreground cursor-pointer text-sm font-bold"
                  aria-label="Remove attachment"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 w-full">
          <input
            type="file"
            multiple
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
            id="chat-file-input"
          />

          <button
            id="mic-toggle-btn"
            type="button"
            aria-label="Hold to talk"
            title="Hold to talk"
            onPointerDown={(e) => { e.preventDefault(); startListening(); }}
            onPointerUp={(e) => { e.preventDefault(); stopListening(); }}
            onPointerLeave={stopListening}
            onPointerCancel={stopListening}
            className={`grid h-9 w-9 shrink-0 touch-none select-none place-items-center rounded-full transition-all duration-300 ease-in-out hover:scale-105 active:scale-95 cursor-pointer ${
              isMicActive
                ? "bg-red-500/20 text-red-400 hover:bg-red-500/30 animate-pulse"
                : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
            }`}
          >
            {isMicActive ? <Mic className="h-4.5 w-4.5" /> : <MicOff className="h-4.5 w-4.5" />}
          </button>

          <button
            id="camera-toggle-btn"
            type="button"
            aria-label="Attach File / Camera"
            onClick={triggerFileSelect}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-all duration-300 ease-in-out hover:scale-105 active:scale-95 cursor-pointer"
          >
            <Camera className="h-4.5 w-4.5" />
          </button>

          <button
            id="audio-toggle-btn"
            type="button"
            aria-label="Voice output text reader toggle"
            onClick={() => setIsAudioActive(!isAudioActive)}
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-full transition-all duration-300 ease-in-out hover:scale-105 active:scale-95 cursor-pointer ${
              isAudioActive
                ? "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                : "bg-red-500/20 text-red-400 hover:bg-red-500/30"
            }`}
          >
            {isAudioActive ? <Volume2 className="h-4.5 w-4.5" /> : <VolumeX className="h-4.5 w-4.5" />}
          </button>

          <input
            id="chat-input-text"
            value={messageInput}
            onChange={e => setMessageInput(e.target.value)}
            placeholder="Ask Ruki to search, compare, plan an event or add to cart…"
            className="min-w-0 flex-1 bg-transparent px-2 text-sm font-medium outline-none placeholder:text-muted-foreground/80 text-foreground"
            onKeyDown={e => e.key === "Enter" && handleSendWrapper()}
          />

          <button
            id="chat-send-btn"
            onClick={handleSendWrapper}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-black shadow-sm transition-all duration-300 ease-in-out hover:brightness-110 hover:shadow-[0_0_18px_rgba(255,215,0,0.5)] active:scale-[0.97] disabled:opacity-60 cursor-pointer"
            style={{ backgroundColor: "#FFD700", color: "#0B0410" }}
            disabled={!messageInput.trim() && attachments.length === 0}
          >
            <Send className="h-4 w-4" /> Send
          </button>
        </div>
      </div>
    </div>
  );
}
